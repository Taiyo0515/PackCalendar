import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "io.github.taiyo0515.packcalendar",
  appName: "PackCalendar",
  webDir: "dist",
  ios: { contentInset: "automatic" },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#125748",
    },
  },
};
export default config;
