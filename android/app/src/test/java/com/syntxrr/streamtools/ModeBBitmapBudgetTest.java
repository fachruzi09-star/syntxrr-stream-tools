package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public final class ModeBBitmapBudgetTest {
    @Test public void protectsCameraAndBothVideoSlotsFromStaticAssets() {
        ModeBBitmapBudget budget = new ModeBBitmapBudget();
        ModeBBitmapBudget.Reservation staticReservation =
                budget.tryReserveStatic(ModeBBitmapBudget.STATIC_RESERVATION_LIMIT_BYTES);
        assertNotNull(staticReservation);
        assertNull(budget.tryReserveStatic(1L));
        ModeBBitmapBudget.Reservation camera = budget.tryReserveDynamic(
                ModeBBitmapBudget.CAMERA_RESERVATION_BYTES);
        ModeBBitmapBudget.Reservation videoA = budget.tryReserveDynamic(
                ModeBBitmapBudget.VIDEO_RESERVATION_BYTES);
        ModeBBitmapBudget.Reservation videoB = budget.tryReserveDynamic(
                ModeBBitmapBudget.VIDEO_RESERVATION_BYTES);
        assertNotNull(camera);
        assertNotNull(videoA);
        assertNotNull(videoB);
        assertNull(budget.tryReserveDynamic(1L));
        assertEquals(ModeBBitmapBudget.SESSION_LIMIT_BYTES, budget.getTotalBytesInUse());
        staticReservation.close(); camera.close(); videoA.close(); videoB.close();
        assertEquals(0L, budget.getTotalBytesInUse());
    }

    @Test public void screensaverVideoUsesStaticPoolWithoutTakingCameraOrOverlaySlots() {
        ModeBBitmapBudget budget = new ModeBBitmapBudget();
        ModeBBitmapBudget.Reservation camera = budget.tryReserveDynamic(
                ModeBBitmapBudget.CAMERA_RESERVATION_BYTES);
        ModeBBitmapBudget.Reservation videoA = budget.tryReserveDynamic(
                ModeBBitmapBudget.VIDEO_RESERVATION_BYTES);
        ModeBBitmapBudget.Reservation videoB = budget.tryReserveDynamic(
                ModeBBitmapBudget.VIDEO_RESERVATION_BYTES);
        ModeBBitmapBudget.Reservation screensaverVideo = budget.tryReserveStatic(
                ModeBBitmapBudget.VIDEO_RESERVATION_BYTES);
        assertNotNull(camera);
        assertNotNull(videoA);
        assertNotNull(videoB);
        assertNotNull(screensaverVideo);
        assertTrue(budget.getTotalBytesInUse() <= ModeBBitmapBudget.SESSION_LIMIT_BYTES);
        screensaverVideo.close(); camera.close(); videoA.close(); videoB.close();
        assertEquals(0L, budget.getTotalBytesInUse());
    }

    @Test public void resizeIsAtomicAndCannotExceedPool() {
        ModeBBitmapBudget budget = new ModeBBitmapBudget();
        ModeBBitmapBudget.Reservation reservation = budget.tryReserveStatic(1024L);
        assertNotNull(reservation);
        assertTrue(reservation.resize(2048L));
        assertEquals(2048L, budget.getStaticBytesInUse());
        assertFalse(reservation.resize(ModeBBitmapBudget.STATIC_RESERVATION_LIMIT_BYTES + 1L));
        assertEquals(2048L, budget.getStaticBytesInUse());
        assertTrue(reservation.resize(512L));
        assertEquals(512L, budget.getStaticBytesInUse());
        reservation.close();
        reservation.close();
        assertEquals(0L, budget.getStaticBytesInUse());
    }

    @Test public void argbByteCalculationRejectsInvalidAndOverflowDimensions() {
        assertEquals(4096L, ModeBBitmapBudget.argbBytes(32L, 32L));
        assertEquals(-1L, ModeBBitmapBudget.argbBytes(0L, 32L));
        assertEquals(-1L, ModeBBitmapBudget.argbBytes(Long.MAX_VALUE, 2L));
    }
}
