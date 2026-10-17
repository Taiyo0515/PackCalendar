package io.github.taiyo0515.packcalendar;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Snapshot written by the app (src/core/schedule.ts widgetData), shared by both widgets. */
public final class WidgetData {
    public static final String PREFS = "widget";
    public static final String KEY = "widget.json";

    public static class Line {
        public final String label;
        public final String names;

        Line(String label, String names) {
            this.label = label;
            this.names = names;
        }
    }

    public static class Unit {
        public final String start;
        public final String title;
        public final String bag;
        public final String color;
        public final Line[] lines;

        Unit(String start, String title, String bag, String color, Line[] lines) {
            this.start = start;
            this.title = title;
            this.bag = bag;
            this.color = color;
            this.lines = lines;
        }
    }

    public static class Bar {
        public final String t;
        public final String c;

        Bar(String t, String c) {
            this.t = t;
            this.c = c;
        }
    }

    public static class Snapshot {
        public final String theme;
        public final int weekStart;
        public final Unit[] units;
        public final Map<String, Bar[]> days;
        public final Map<String, String> holidays;

        Snapshot(String theme, int weekStart, Unit[] units, Map<String, Bar[]> days, Map<String, String> holidays) {
            this.theme = theme;
            this.weekStart = weekStart;
            this.units = units;
            this.days = days;
            this.holidays = holidays;
        }
    }

    private WidgetData() {}

    private static String string(JSONObject o, String key, String fallback) {
        return o.has(key) && !o.isNull(key) ? o.optString(key, fallback) : fallback;
    }

    public static Snapshot load(Context c) {
        SharedPreferences prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String json = prefs.getString(KEY, null);
        if (json == null) return null;
        try {
            JSONObject root = new JSONObject(json);
            JSONArray unitsJson = root.optJSONArray("units");
            Unit[] units = new Unit[unitsJson == null ? 0 : unitsJson.length()];
            for (int i = 0; i < units.length; i++) {
                JSONObject u = unitsJson.getJSONObject(i);
                JSONArray linesJson = u.optJSONArray("lines");
                Line[] lines = new Line[linesJson == null ? 0 : linesJson.length()];
                for (int j = 0; j < lines.length; j++) {
                    JSONObject l = linesJson.getJSONObject(j);
                    lines[j] = new Line(l.optString("label", ""), l.optString("names", ""));
                }
                units[i] = new Unit(u.optString("start", ""), u.optString("title", ""),
                    u.optString("bag", ""), u.optString("color", "#1E9E6A"), lines);
            }
            Map<String, Bar[]> days = new HashMap<>();
            JSONObject daysJson = root.optJSONObject("days");
            if (daysJson != null) {
                JSONArray names = daysJson.names();
                for (int i = 0; names != null && i < names.length(); i++) {
                    String key = names.optString(i);
                    JSONArray bars = daysJson.optJSONArray(key);
                    Bar[] list = new Bar[bars == null ? 0 : bars.length()];
                    for (int j = 0; j < list.length; j++) {
                        JSONObject b = bars.getJSONObject(j);
                        list[j] = new Bar(b.optString("t", ""), b.optString("c", "#1E9E6A"));
                    }
                    days.put(key, list);
                }
            }
            Map<String, String> holidays = new HashMap<>();
            JSONObject holidaysJson = root.optJSONObject("holidays");
            if (holidaysJson != null) {
                JSONArray names = holidaysJson.names();
                for (int i = 0; names != null && i < names.length(); i++) {
                    String key = names.optString(i);
                    holidays.put(key, holidaysJson.optString(key, ""));
                }
            }
            return new Snapshot(root.optString("theme", "system"), root.optInt("weekStart", 0), units, days, holidays);
        } catch (Exception e) {
            return null;
        }
    }

    public static boolean isDark(Snapshot s, Context c) {
        if (s == null || s.theme == null || s.theme.equals("system")) {
            int mode = c.getResources().getConfiguration().uiMode
                & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
            return mode == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        }
        return s.theme.equals("dark");
    }

    // MARK: Local wall-clock figures (mirrors the Swift widget)

    public static Calendar calendar() {
        return Calendar.getInstance(Locale.getDefault());
    }

    /** Formats a millis timestamp in the device's zone as the app prints stamps. */
    public static String stamp(long ms) {
        return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US).format(new java.util.Date(ms));
    }

    public static String day(long ms) {
        return new java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new java.util.Date(ms));
    }

    public static boolean isAllDayStamp(String start) {
        return start.endsWith("T00:00");
    }

    /** "今日 10:30" / "明日" / "10/25(土) 09:00" like the Swift widget. */
    public static String when(String start, long now) {
        long ms = millis(start);
        if (ms < 0) return "";
        Calendar nowCal = calendar();
        long todayStart = startOfDayLong(nowCal, now);
        long dayStart = startOfDayLong(nowCal, ms);
        long days = (dayStart - todayStart) / 86400000L;
        Calendar c = calendar();
        c.setTimeInMillis(ms);
        String day;
        if (days == 0) day = "今日";
        else if (days == 1) day = "明日";
        else day = (c.get(Calendar.MONTH) + 1) + "/" + c.get(Calendar.DAY_OF_MONTH)
                + "(" + weekdays()[weekdayIndex(c)] + ")";
        if (isAllDayStamp(start)) return day;
        return day + " " + c.get(Calendar.HOUR_OF_DAY) + ":"
            + String.format(Locale.US, "%02d", c.get(Calendar.MINUTE));
    }

    public static long millis(String start) {
        if (start == null || start.length() < 16) return -1;
        try {
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US);
            return f.parse(start).getTime();
        } catch (Exception e) {
            return -1;
        }
    }

    public static String[] weekdays() {
        return new String[] { "日", "月", "火", "水", "木", "金", "土" };
    }

    public static int weekdayIndex(Calendar c) {
        return c.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
    }

    /** Millis of the midnight that precedes t. */
    public static long startOfDayLong(Calendar cal, long t) {
        cal.setTimeInMillis(t);
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }
}
