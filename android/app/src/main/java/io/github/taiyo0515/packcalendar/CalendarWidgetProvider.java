package io.github.taiyo0515.packcalendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Bundle;
import android.widget.RemoteViews;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/** Large widget: the month calendar with bag bars, drawn on a bitmap (like the iOS SwiftUI view). */
public class CalendarWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        updateAll(context, mgr, ids);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager mgr, int id, Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, mgr, id, newOptions);
        updateAll(context, mgr, new int[] { id });
    }

    static void updateAll(Context context, AppWidgetManager mgr, int[] ids) {
        WidgetData.Snapshot snapshot = WidgetData.load(context);
        boolean dark = WidgetData.isDark(snapshot, context);
        float density = context.getResources().getDisplayMetrics().density;
        for (int id : ids) {
            Bundle o = mgr.getAppWidgetOptions(id);
            int wDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
            int hDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 250);
            Bitmap bmp = draw(snapshot, dark, density, Math.round(wDp * density), Math.round(hDp * density));
            RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.calendar_widget);
            rv.setInt(R.id.root, "setBackgroundResource", dark ? R.drawable.widget_bg_dark : R.drawable.widget_bg);
            rv.setImageViewBitmap(R.id.grid, bmp);
            Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (open != null) {
                rv.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(
                    context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            }
            mgr.updateAppWidget(id, rv);
        }
        PrepWidgetProvider.scheduleNext(context, snapshot);
    }

    // Palette mirroring the iOS widget colors.
    private static final int[] BG = { 0xFFFFFFFF, 0xFF111111 };
    private static final int[] TEXT = { 0xFF111111, 0xFFF2F2F2 };
    private static final int SUB = 0xFF8E8E93;
    private static final int[] FAINT = { 0xFFC7C7CC, 0xFF48484A };
    private static final int[] LINE = { 0xFFE3E3E8, 0xFF2A2A2C };
    private static final int[] RED = { 0xFFE5484D, 0xFFFF6369 };
    private static final int[] BLUE = { 0xFF2F6FDF, 0xFF5B8DEF };
    private static final int[] HOLIDAY = { 0xFFD93A40, 0xFFC9363C };

    static Bitmap draw(WidgetData.Snapshot snapshot, boolean dark, float density, int width, int height) {
        if (width <= 0 || height <= 0) {
            width = Math.round(250 * density);
            height = Math.round(250 * density);
        }
        Bitmap bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        // Rounded background matching the widget background drawables (16dp corners).
        Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgPaint.setColor(BG[dark ? 1 : 0]);
        canvas.drawRoundRect(new RectF(0, 0, width, height), 16 * density, 16 * density, bgPaint);
        canvas.clipRect(0, 0, width, height);

        float pad = 12 * density;
        RectF area = new RectF(pad, pad, width - pad, height - pad);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        long now = System.currentTimeMillis();
        Calendar c = WidgetData.calendar();
        c.setTimeInMillis(now);
        int month = c.get(Calendar.MONTH);
        int weekStart = snapshot == null ? 0 : snapshot.weekStart;

        // Title row
        paint.setTextSize(16 * density);
        paint.setFakeBoldText(true);
        paint.setColor(TEXT[dark ? 1 : 0]);
        paint.setTextAlign(Paint.Align.LEFT);
        Paint.FontMetrics fm = paint.getFontMetrics();
        float titleH = -fm.top;
        canvas.drawText((month + 1) + "月", area.left, area.top + titleH * 0.8f, paint);
        float titleRow = titleH + 4 * density;

        float headerH = 12 * density;
        float rows = 6;
        float cellH = (area.height() - titleRow - headerH) / rows;

        // Weekday header
        paint.setTextSize(9 * density);
        paint.setFakeBoldText(false);
        paint.setTextAlign(Paint.Align.CENTER);
        String[] wd = WidgetData.weekdays();
        float colW = area.width() / 7f;
        for (int i = 0; i < 7; i++) {
            int wdi = (i + weekStart) % 7;
            paint.setColor(wdi == 0 ? RED[dark ? 1 : 0] : wdi == 6 ? BLUE[dark ? 1 : 0] : SUB);
            canvas.drawText(wd[wdi], area.left + colW * (i + 0.5f), area.top + titleRow + 9 * density, paint);
        }
        float headerBottom = area.top + titleRow + headerH;

        // 6 weeks of cells
        Calendar first = WidgetData.calendar();
        first.setTimeInMillis(now);
        first.set(Calendar.DAY_OF_MONTH, 1);
        int offset = (WidgetData.weekdayIndex(first) - weekStart + 7) % 7;
        Calendar start = (Calendar) first.clone();
        start.add(Calendar.DAY_OF_MONTH, -offset);

        for (int row = 0; row < rows; row++) {
            float rowTop = headerBottom + cellH * row;
            // Hairline above each row (skip the first one, like the iOS layout)
            if (row > 0) {
                paint.setFakeBoldText(false);
                paint.setColor(LINE[dark ? 1 : 0]);
                paint.setStrokeWidth(Math.max(1f, density * 0.5f));
                canvas.drawLine(area.left, rowTop, area.right, rowTop, paint);
            }
            for (int col = 0; col < 7; col++) {
                int index = row * 7 + col;
                Calendar day = (Calendar) start.clone();
                day.add(Calendar.DAY_OF_MONTH, index);
                drawCell(canvas, paint, snapshot, dark, density, day, month, now,
                    area.left + colW * col, rowTop, colW, cellH, weekStart);
            }
        }
        return bmp;
    }

    @android.annotation.SuppressLint("DefaultLocale")
    private static void drawCell(Canvas canvas, Paint paint, WidgetData.Snapshot snapshot, boolean dark,
        float density, Calendar day, int month, long now, float x, float y, float w, float h, int weekStart) {
        String key = WidgetData.day(day.getTimeInMillis());
        int d = dark ? 1 : 0;
        boolean isHoliday = snapshot != null && snapshot.holidays.containsKey(key);
        boolean other = day.get(Calendar.MONTH) != month;
        boolean today = WidgetData.startOfDayLong(WidgetData.calendar(), day.getTimeInMillis())
            == WidgetData.startOfDayLong(WidgetData.calendar(), now);
        int wdi = (WidgetData.weekdayIndex(day) - weekStart + 7) % 7;

        int numberColor;
        if (today) numberColor = 0xFFFFFFFF;
        else if (other) numberColor = FAINT[d];
        else if (isHoliday || wdi == 0) numberColor = RED[d];
        else if (wdi == 6) numberColor = BLUE[d];
        else numberColor = TEXT[d];

        float cx = x + w / 2f;
        float numSize = 10 * density;
        if (today) {
            paint.setFakeBoldText(true);
            paint.setColor(RED[d]);
            canvas.drawCircle(cx, y + numSize * 0.9f, 8 * density, paint);
        } else {
            paint.setFakeBoldText(false);
        }
        paint.setTextSize(numSize);
        paint.setColor(numberColor);
        paint.setTextAlign(Paint.Align.CENTER);
        canvas.drawText(String.valueOf(day.get(Calendar.DAY_OF_MONTH)), cx, y + numSize * 1.5f, paint);

        // Bars: holidays first, then bag bars; when crowded only the first shows.
        List<Object[]> bars = new ArrayList<>(); // [String, int color]
        if (snapshot != null && isHoliday) {
            bars.add(new Object[] { snapshot.holidays.get(key), HOLIDAY[d] });
        }
        if (snapshot != null && snapshot.days != null && snapshot.days.containsKey(key)) {
            for (WidgetData.Bar b : snapshot.days.get(key)) {
                bars.add(new Object[] { b.t, PrepWidgetProvider.safe(b.c, PrepWidgetProvider.color("#1E9E6A")) });
            }
        }
        boolean crowded = bars.size() > 2;
        List<Object[]> shown;
        if (crowded) {
            shown = new ArrayList<>();
            if (!bars.isEmpty()) shown.add(bars.get(0));
        } else {
            shown = bars;
        }

        float barTop = y + 16 * density + 3 * density;
        float barH = 12 * density;
        paint.setFakeBoldText(true);
        paint.setTextSize(8 * density);
        paint.setTextAlign(Paint.Align.LEFT);
        int barAlpha = other ? 160 : 255;
        int textAlpha = other ? 192 : 255;
        for (int i = 0; i < shown.size(); i++) {
            float top = barTop + barH * i;
            Paint pill = new Paint(Paint.ANTI_ALIAS_FLAG);
            pill.setColor((int) shown.get(i)[1]);
            pill.setAlpha(barAlpha);
            canvas.drawRoundRect(new RectF(x + density, top, x + w - density, top + barH - density), 2 * density,
                2 * density, pill);
            paint.setColor(0xFFFFFFFF);
            paint.setAlpha(textAlpha);
            canvas.drawText((String) shown.get(i)[0], x + 4 * density, top + 9 * density, paint);
        }
        paint.setAlpha(255);
        if (crowded) {
            paint.setColor(SUB);
            paint.setFakeBoldText(false);
            canvas.drawText("+" + (bars.size() - 1), x + 4 * density, barTop + barH + 7 * density, paint);
        }
    }
}
