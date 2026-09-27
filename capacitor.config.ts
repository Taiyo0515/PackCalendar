import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "io.github.taiyo0515.packcalendar",
  appName: "PackCalendar",
  webDir: "dist",
  ios: { contentInset: "never", scrollEnabled: false },
};
export default config;
