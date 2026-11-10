import sodium from "libsodium-wrappers";

/** Update one Actions repository secret (sealed-box encrypted with the repo's public key). */
export async function setRepoSecret(
  opts: { repo: string; token: string; name: string; value: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const headers = {
    authorization: `Bearer ${opts.token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  const base = `https://api.github.com/repos/${opts.repo}/actions/secrets`;
  const keyRes = await fetchImpl(`${base}/public-key`, { headers });
  if (!keyRes.ok) throw new Error(`GitHub public-key fetch failed (${keyRes.status})`);
  const { key, key_id } = (await keyRes.json()) as { key: string; key_id: string };

  await sodium.ready;
  const encrypted = sodium.crypto_box_seal(
    sodium.from_string(opts.value),
    sodium.from_base64(key, sodium.base64_variants.ORIGINAL),
  );
  const put = await fetchImpl(`${base}/${opts.name}`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      encrypted_value: sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL),
      key_id,
    }),
  });
  if (!put.ok) throw new Error(`GitHub secret update failed (${put.status})`);
}
