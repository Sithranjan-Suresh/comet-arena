/** Phrase the extraction repair prompt contains (Task 43). The mock vision model never corrupts a repair call. */
export const REPAIR_MARKER = "Your previous output was invalid";

/** Mock flyer images are referenced as mock://flyers/<file> so no real storage is needed. */
export const MOCK_FLYER_PREFIX = "mock://flyers/";
export const mockFlyerUrl = (file: string) => `${MOCK_FLYER_PREFIX}${file}`;
