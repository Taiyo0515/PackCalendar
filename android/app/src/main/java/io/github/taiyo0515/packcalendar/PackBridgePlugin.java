package io.github.taiyo0515.packcalendar;

import android.Manifest;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.os.Handler;
import android.os.Looper;
import android.provider.CalendarContract;
import android.view.View;
import android.view.Window;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Bridge for things the web layer cannot do: widget data, window appearance, and calendar import.
 * Mirrors the iOS PackBridgePlugin so the PackBridge JS interface stays identical.
 */
@CapacitorPlugin(
    name = "PackBridge",
    permissions = { @Permission(alias = "readCalendar", strings = { Manifest.permission.READ_CALENDAR }) }
)
public class PackBridgePlugin extends Plugin {

    private static final SimpleDateFormat wallStamp = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US);
    private static final SimpleDateFormat wallDay = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    private static final SimpleDateFormat utcDay = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    static {
        utcDay.setTimeZone(TimeZone.getTimeZone("UTC"));
    }

    @PluginMethod
    public void saveWidget(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        getContext().getSharedPreferences(WidgetData.PREFS, Context.MODE_PRIVATE)
            .edit().putString(WidgetData.KEY, json).apply();
        notifyWidgets();
        JSObject result = new JSObject();
        JSArray groups = new JSArray();
        groups.put("prefs");
        result.put("groups", groups);
        call.resolve(result);
    }

    @PluginMethod
    public void widgetStatus(PluginCall call) {
        boolean readable = getContext()
            .getSharedPreferences(WidgetData.PREFS, Context.MODE_PRIVATE)
            .contains(WidgetData.KEY);
        JSObject result = new JSObject();
        JSArray candidates = new JSArray();
        candidates.put("prefs");
        result.put("candidates", candidates);
        result.put("readable", readable);
        call.resolve(result);
    }

    @PluginMethod
    public void setAppearance(PluginCall call) {
        String mode = call.getString("mode", "system");
        new Handler(Looper.getMainLooper()).post(() -> {
            android.app.Activity act = getActivity();
            if (act == null) {
                call.resolve();
                return;
            }
            Window window = act.getWindow();
            int current = window.getDecorView().getSystemUiVisibility();
            int next = mode.equals("dark")
                ? (current & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR)
                : (current | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
            window.getDecorView().setSystemUiVisibility(next);
            call.resolve();
        });
    }

    @PluginMethod
    public void readCalendar(PluginCall call) {
        if (call.getString("from") == null || call.getString("to") == null) {
            call.reject("from/to required");
            return;
        }
        if (!hasRequiredPermissions()) {
            requestAllPermissions(call, "calResult");
            return;
        }
        readEvents(call);
    }

    @PermissionCallback
    public void calResult(PluginCall call) {
        if (!hasRequiredPermissions()) {
            call.reject("カレンダーへの許可がありません");
            return;
        }
        readEvents(call);
    }

    private static Date parseStamp(String s) {
        try {
            synchronized (wallStamp) {
                return wallStamp.parse(s);
            }
        } catch (Exception e) {
            return null;
        }
    }

    private void notifyWidgets() {
        AppWidgetManager mgr = AppWidgetManager.getInstance(getContext());
        int[] prep = mgr.getAppWidgetIds(new ComponentName(getContext(), PrepWidgetProvider.class));
        if (prep.length > 0) PrepWidgetProvider.updateAll(getContext(), mgr, prep);
        int[] cal = mgr.getAppWidgetIds(new ComponentName(getContext(), CalendarWidgetProvider.class));
        if (cal.length > 0) CalendarWidgetProvider.updateAll(getContext(), mgr, cal);
    }

    // Calendars whose events are never part of a personal schedule: contacts' birthdays and
    // preloaded holiday subscription calendars (the app already colours holidays itself).
    private static final Pattern SKIP_CALENDAR = Pattern.compile("(?i)birthday|誕生日|祝日|holiday");

    private static final SimpleDateFormat untilParser = new SimpleDateFormat("yyyyMMdd", Locale.US);
    static {
        untilParser.setTimeZone(TimeZone.getTimeZone("UTC"));
    }

    /** Maps an Android RRULE to the app's repeat model, mirroring the iOS restriction set. */
    private static JSObject repeatOf(String rrule, long dtstart) {
        if (rrule == null) return null;
        String freq = match(rrule, "FREQ=([A-Z]+)");
        if (freq == null) return null;
        JSObject r = new JSObject();
        List<Integer> days = new ArrayList<>();
        switch (freq) {
            case "DAILY":
                r.put("freq", "daily");
                break;
            case "WEEKLY": {
                String byDay = match(rrule, "BYDAY=([^;]+)");
                if (byDay != null) {
                    Matcher m = Pattern.compile("(MO|TU|WE|TH|FR|SA|SU)").matcher(byDay);
                    while (m.find()) {
                        String[] order = { "MO", "TU", "WE", "TH", "FR", "SA", "SU" };
                        for (int i = 0; i < order.length; i++) {
                            if (order[i].equals(m.group(1))) {
                                days.add(i);
                                break;
                            }
                        }
                    }
                    Collections.sort(days);
                } else {
                    Calendar d = Calendar.getInstance();
                    d.setTimeInMillis(dtstart);
                    days.add((d.get(Calendar.DAY_OF_WEEK) + 5) % 7);
                }
                r.put("freq", "weekly");
                break;
            }
            case "MONTHLY": {
                // Monthly weekday rules (2nd Monday etc.) are not representable; skip like on iOS.
                if (match(rrule, "BYDAY=[^;]+") != null) return null;
                r.put("freq", "monthly");
                break;
            }
            default:
                return null;
        }
        JSArray weekdays = new JSArray();
        for (int d : days) weekdays.put(d);
        r.put("weekdays", weekdays);
        String until = match(rrule, "UNTIL=([0-9]{8})(?:T[0-9]+Z?)?");
        if (until != null) {
            try {
                synchronized (untilParser) {
                    Date d = untilParser.parse(until);
                    synchronized (wallDay) {
                        r.put("until", wallDay.format(d));
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return r;
    }

    private static String match(String s, String regex) {
        Matcher m = Pattern.compile(regex).matcher(s);
        return m.find() ? m.group(1) : null;
    }

    private void readEvents(PluginCall call) {
        new Thread(() -> {
            Context c = getContext();
            Date from = parseStamp(call.getString("from"));
            Date to = parseStamp(call.getString("to"));
            if (from == null || to == null) {
                call.reject("from/to required");
                return;
            }
            long fromMs = from.getTime();
            long toMs = to.getTime();

            // Calendars to ignore (birthdays / preloaded holiday subscriptions).
            List<Long> skipIds = new ArrayList<>();
            try {
                Cursor cc = c.getContentResolver().query(
                    CalendarContract.Calendars.CONTENT_URI,
                    new String[] { CalendarContract.Calendars._ID, CalendarContract.Calendars.ACCOUNT_NAME,
                        CalendarContract.Calendars.CALENDAR_DISPLAY_NAME },
                    null, null, null);
                if (cc != null) {
                    int iAccount = cc.getColumnIndexOrThrow(CalendarContract.Calendars.ACCOUNT_NAME);
                    int iDisplay = cc.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME);
                    while (cc.moveToNext()) {
                        String name = (iAccount >= 0 ? cc.getString(iAccount) : "") + " "
                            + (iDisplay >= 0 ? cc.getString(iDisplay) : "");
                        if (SKIP_CALENDAR.matcher(name == null ? "" : name).find()) {
                            skipIds.add(cc.getLong(cc.getColumnIndexOrThrow(CalendarContract.Calendars._ID)));
                        }
                    }
                    cc.close();
                }
            } catch (Exception ignored) {
            }

            List<JSObject> events = new ArrayList<>();
            try {
                String selection =
                    "(" + CalendarContract.Events.DTSTART + " <= ?)"
                        + " AND ((" + CalendarContract.Events.DTEND + " > ?)"
                        + " OR (" + CalendarContract.Events.DTEND + " IS NULL)"
                        + " OR (" + CalendarContract.Events.RRULE + " IS NOT NULL))"
                        + " AND (" + CalendarContract.Events.STATUS + " IS NULL OR " + CalendarContract.Events.STATUS
                        + " != " + CalendarContract.Events.STATUS_CANCELED + ")";
                Cursor cur = c.getContentResolver().query(
                    CalendarContract.Events.CONTENT_URI,
                    new String[] { CalendarContract.Events._ID, CalendarContract.Events.CALENDAR_ID,
                        CalendarContract.Events.TITLE, CalendarContract.Events.DTSTART, CalendarContract.Events.DTEND,
                        CalendarContract.Events.ALL_DAY, CalendarContract.Events.EVENT_LOCATION,
                        CalendarContract.Events.RRULE },
                    selection,
                    new String[] { String.valueOf(toMs), String.valueOf(fromMs) },
                    CalendarContract.Events.DTSTART + " ASC");
                if (cur == null) {
                    call.reject("カレンダーが読めませんでした");
                    return;
                }
                int ii = cur.getColumnIndexOrThrow(CalendarContract.Events._ID);
                int ci = cur.getColumnIndexOrThrow(CalendarContract.Events.CALENDAR_ID);
                int ti = cur.getColumnIndexOrThrow(CalendarContract.Events.TITLE);
                int si = cur.getColumnIndexOrThrow(CalendarContract.Events.DTSTART);
                int ei = cur.getColumnIndexOrThrow(CalendarContract.Events.DTEND);
                int ai = cur.getColumnIndexOrThrow(CalendarContract.Events.ALL_DAY);
                int li = cur.getColumnIndexOrThrow(CalendarContract.Events.EVENT_LOCATION);
                int ri = cur.getColumnIndexOrThrow(CalendarContract.Events.RRULE);
                String lastId = "";
                while (cur.moveToNext()) {
                    if (skipIds.contains(cur.getLong(ci))) continue;
                    String title = cur.getString(ti);
                    if (title == null || title.isEmpty()) continue;
                    String eventId = String.valueOf(cur.getLong(ii));
                    if (eventId.equals(lastId)) continue;
                    lastId = eventId;
                    long dtstart = cur.getLong(si);
                    long dtend = cur.isNull(ei) ? 0L : cur.getLong(ei);
                    boolean allDay = cur.getInt(ai) != 0;
                    long one = 86400000L;
                    String start, end;
                    synchronized (utcDay) {
                        synchronized (wallStamp) {
                            synchronized (wallDay) {
                                if (allDay) {
                                    start = utcDay.format(new Date(dtstart)) + "T00:00";
                                    end = dtend > 0
                                        ? utcDay.format(new Date(dtend)) + "T00:00"
                                        : utcDay.format(new Date(dtstart + one)) + "T00:00";
                                } else {
                                    start = wallStamp.format(new Date(dtstart));
                                    end = dtend > 0 ? wallStamp.format(new Date(dtend)) : null;
                                }
                            }
                        }
                    }
                    JSObject item = new JSObject();
                    item.put("uid", eventId);
                    item.put("title", title);
                    item.put("start", start);
                    item.put("end", end == null ? JSObject.NULL : end);
                    item.put("allDay", allDay);
                    String location = cur.getString(li);
                    item.put("memo", location == null ? "" : location);
                    JSObject repeat = repeatOf(cur.getString(ri), dtstart);
                    item.put("repeat", repeat == null ? JSObject.NULL : repeat);
                    events.add(item);
                }
                cur.close();
            } catch (Exception e) {
                call.reject("カレンダーが読めませんでした: " + e.getClass().getSimpleName());
                return;
            }
            JSObject result = new JSObject();
            JSArray list = new JSArray();
            for (JSObject o : events) list.put(o);
            result.put("events", list);
            call.resolve(result);
        }).start();
    }
}
