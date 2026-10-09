import type { MetadataRoute } from "next";

// School OS is an installable web app (00-global.md §6).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "School OS",
    short_name: "School OS",
    description: "The complete software for running a school.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#1d4ed8",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
