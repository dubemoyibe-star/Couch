import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Couch",
    short_name: "Couch",
    description: "Pick something to watch, then settle in together.",
    start_url: "/",
    display: "standalone",
    background_color: "#171412",
    theme_color: "#171412",
    icons: [
      { src: "/icons/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
