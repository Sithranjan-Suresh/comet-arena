// Comet Arena service worker: shows deadline notifications and opens the competition when tapped.
self.addEventListener("push", (event) => {
  let data = { title: "Comet Arena", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* a plain-text push still shows a generic notification */
  }
  event.waitUntil(
    self.registration.showNotification(String(data.title).slice(0, 120), {
      body: String(data.body).slice(0, 240),
      tag: data.tag,
      icon: "/favicon.ico",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only same-site paths: a push payload can never send the user to another site.
  const raw = event.notification.data && event.notification.data.url;
  const path = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(path);
          return c.focus();
        }
      }
      return self.clients.openWindow(path);
    }),
  );
});
