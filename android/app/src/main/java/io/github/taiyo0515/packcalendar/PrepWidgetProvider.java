package io.github.taiyo0515.packcalendar;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.widget.RemoteViews;

import java.util.Calendar;

/** Small widget: the carryover items for the next preparation within 48 hours. */
public class PrepWidgetProvider extends AppWidgetProvider {

    static final String ACTION_UPDATE = "io.github.taiyo0515.packcalendar.WIDGET_UPDATE";

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        updateAll(context, mgr, ids);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_UPDATE.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            updateAll(context, mgr,
                mgr.getAppWidgetIds(new ComponentName(context, PrepWidgetProvider.class)));
            // Calendar redraws too so the month flips and bars stay fresh.
            CalendarWidgetProvider.updateAll(context, mgr,
                mgr.getAppWidgetIds(new ComponentName(context, CalendarWidgetProvider.class)));
        }
    }

    static void updateAll(Context context, AppWidgetManager mgr, int[] ids) {
        WidgetData.Snapshot snapshot = WidgetData.load(context);
        boolean dark = WidgetData.isDark(snapshot, context);
        for (int id : ids) {
            mgr.updateAppWidget(id, build(context, snapshot, dark));
        }
        scheduleNext(context, snapshot);
    }

    static RemoteViews build(Context context, WidgetData.Snapshot snapshot, boolean dark) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.prep_widget);
        rv.setBackgroundResource(R.id.root, dark ? R.drawable.widget_bg_dark : R.drawable.widget_bg);

        int sub = color("#8E8E93");
        int text = color(dark ? "#F2F2F2" : "#111111");
        int accent = color(dark ? "#2FBF83" : "#1E9E6A");

        rv.setTextColor(R.id.when, sub);
        rv.setTextColor(R.id.bag, text);
        rv.setTextColor(R.id.line1label, sub);
        rv.setTextColor(R.id.line1name, text);
        rv.setTextColor(R.id.line2label, sub);
        rv.setTextColor(R.id.line2name, text);
        rv.setTextColor(R.id.okText, accent);
        rv.setTextColor(R.id.empty, sub);

        // Tapping anywhere opens the app.
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open != null) {
            rv.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(
                context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }

        long now = System.currentTimeMillis();
        if (snapshot == null) {
            showAll(rv, GONE, GONE, GONE, GONE, GONE, GONE, VISIBLE);
            rv.setTextViewText(R.id.when, "");
            rv.setTextViewText(R.id.bag, "");
            rv.setTextViewText(R.id.empty, "アプリを開いてください");
            return rv;
        }

        // The next unit starting within 48 hours, like the iOS widget.
        WidgetData.Unit unit = null;
        for (WidgetData.Unit u : snapshot.units) {
            long ms = WidgetData.millis(u.start);
            if (ms > now && ms <= now + 48L * 3600 * 1000) {
                unit = u;
                break;
            }
        }
        if (unit == null) {
            showAll(rv, GONE, GONE, GONE, GONE, GONE, GONE, VISIBLE);
            rv.setTextViewText(R.id.when, "");
            rv.setTextViewText(R.id.bag, "");
            rv.setTextViewText(R.id.empty, "予定なし");
            return rv;
        }

        showAll(rv, VISIBLE, VISIBLE,
            unit.lines.length > 0 ? VISIBLE : GONE,
            unit.lines.length > 0 ? VISIBLE : GONE,
            unit.lines.length > 1 ? VISIBLE : GONE,
            unit.lines.length > 1 ? VISIBLE : GONE,
            unit.lines.length == 0 ? VISIBLE : GONE);
        if (unit.lines.length == 0) {
            showAll(rv, VISIBLE, VISIBLE, GONE, GONE, GONE, GONE, VISIBLE);
            rv.setTextViewText(R.id.okText, "✓ 準備OK");
        } else if (unit.lines.length <= 2) {
            showAll(rv, VISIBLE, VISIBLE, VISIBLE, VISIBLE,
                unit.lines.length > 1 ? VISIBLE : GONE, unit.lines.length > 1 ? VISIBLE : GONE, GONE);
            rv.setTextViewText(R.id.line1label, unit.lines[0].label);
            rv.setTextViewText(R.id.line1name, unit.lines[0].names);
            if (unit.lines.length > 1) {
                rv.setTextViewText(R.id.line2label, unit.lines[1].label);
                rv.setTextViewText(R.id.line2name, unit.lines[1].names);
            }
        } else {
            // First line plus "ほか n点" like the iOS widget compresses the rest.
            showAll(rv, VISIBLE, VISIBLE, VISIBLE, VISIBLE, VISIBLE, VISIBLE, GONE);
            int rest = 0;
            for (int i = 1; i < unit.lines.length; i++) {
                rest += unit.lines[i].names.split("・").length;
            }
            rv.setTextViewText(R.id.line1label, unit.lines[0].label);
            rv.setTextViewText(R.id.line1name, unit.lines[0].names);
            rv.setTextViewText(R.id.line2label, "ほか");
            rv.setTextViewText(R.id.line2name, rest + "点");
        }
        rv.setTextViewText(R.id.when, WidgetData.when(unit.start, now));
        rv.setTextViewText(R.id.bag, unit.bag);
        rv.setTextColor(R.id.bag, safe(unit.color, accent));
        return rv;
    }

    private static void showAll(RemoteViews rv, int when, int bag, int l1, int n1, int l2, int n2, int ok) {
        rv.setViewVisibility(R.id.when, when);
        rv.setViewVisibility(R.id.bag, bag);
        rv.setViewVisibility(R.id.line1label, l1);
        rv.setViewVisibility(R.id.line1name, n1);
        rv.setViewVisibility(R.id.line2label, l2);
        rv.setViewVisibility(R.id.line2name, n2);
        rv.setViewVisibility(R.id.okText, ok);
        if (ok == VISIBLE) rv.setTextViewText(R.id.empty, "");
    }

    private static final int GONE = android.view.View.GONE;
    private static final int VISIBLE = android.view.View.VISIBLE;

    static int color(String hex) {
        try {
            return Color.parseColor(hex);
        } catch (Exception e) {
            return Color.parseColor("#8E8E93");
        }
    }

    static int safe(String hex, int fallback) {
        try {
            return Color.parseColor(hex);
        } catch (Exception e) {
            return fallback;
        }
    }

    /** Re-renders when time moves: the next unit start or the coming midnight. */
    static void scheduleNext(Context context, WidgetData.Snapshot snapshot) {
        long now = System.currentTimeMillis();
        long next = now + 30L * 60 * 1000;
        if (snapshot != null) {
            for (WidgetData.Unit u : snapshot.units) {
                long ms = WidgetData.millis(u.start);
                if (ms > now && ms < next) next = ms;
            }
        }
        // "今日" labels and month grids must flip at midnight.
        Calendar midnight = WidgetData.calendar();
        long md = WidgetData.startOfDayLong(midnight, now) + 86400000L;
        next = Math.min(next, md);

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, PrepWidgetProvider.class);
        intent.setAction(ACTION_UPDATE);
        PendingIntent pi = PendingIntent.getBroadcast(
            context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long elapsed = android.os.SystemClock.elapsedRealtime() + (next - now);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, elapsed, pi);
                } catch (SecurityException se) {
                    am.setWindow(AlarmManager.ELAPSED_REALTIME_WAKEUP, elapsed, 10 * 60 * 1000, pi);
                }
            } else {
                am.setWindow(AlarmManager.ELAPSED_REALTIME_WAKEUP, elapsed, 10 * 60 * 1000, pi);
            }
        } catch (Exception ignored) {
        }
    }
}
