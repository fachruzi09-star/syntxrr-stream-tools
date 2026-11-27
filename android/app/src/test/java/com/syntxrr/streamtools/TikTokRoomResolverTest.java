package com.syntxrr.streamtools;

import org.junit.Test;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** Offline unit tests for TikTokRoomResolver URL builders, API statusCode handling, and HTML parsing. */
public class TikTokRoomResolverTest {

    @Test
    public void roomLookupUrlIncludesConsistentWebClientParamsAndSecureRandomDeviceId() throws Exception {
        String url1 = TikTokRoomResolver.buildRoomLookupUrl("@.jejeangela");
        String url2 = TikTokRoomResolver.buildRoomLookupUrl(".jejeangela");

        assertTrue(url1.startsWith(TikTokRoomResolver.ROOM_LOOKUP_ENDPOINT + "?"));
        assertTrue(url2.startsWith(TikTokRoomResolver.ROOM_LOOKUP_ENDPOINT + "?"));

        Map<String, String> params1 = parseQuery(url1.substring(url1.indexOf('?') + 1));
        Map<String, String> params2 = parseQuery(url2.substring(url2.indexOf('?') + 1));

        assertEquals(".jejeangela", params1.get("uniqueId"));
        assertEquals("54", params1.get("sourceType"));
        assertEquals("1988", params1.get("aid"));
        assertEquals("tiktok_web", params1.get("app_name"));
        assertEquals("en", params1.get("app_language"));
        assertEquals("en-US", params1.get("browser_language"));
        assertEquals("Mozilla", params1.get("browser_name"));
        assertEquals("true", params1.get("browser_online"));
        assertEquals("Linux aarch64", params1.get("browser_platform"));
        assertEquals("web_mobile", params1.get("device_platform"));
        assertEquals("android", params1.get("os"));
        assertEquals("true", params1.get("cookie_enabled"));
        assertEquals("true", params1.get("focus_state"));
        assertEquals("user", params1.get("from_page"));
        assertEquals("false", params1.get("is_fullscreen"));
        assertEquals("true", params1.get("is_page_visible"));
        assertEquals("https://www.tiktok.com/", params1.get("referer"));
        assertEquals("https://www.tiktok.com/", params1.get("root_referer"));
        assertEquals("UTC", params1.get("tz_name"));
        assertTrue(TikTokRoomResolver.MOBILE_USER_AGENT.endsWith(params1.get("browser_version").substring(4)));

        String dev1 = params1.get("device_id");
        String dev2 = params2.get("device_id");
        assertNotNull(dev1);
        assertNotNull(dev2);
        assertTrue(dev1.matches("^[1-9][0-9]{18}$"));
        assertTrue(dev2.matches("^[1-9][0-9]{18}$"));

        Set<String> generatedIds = new HashSet<>();
        generatedIds.add(dev1);
        generatedIds.add(dev2);
        for (int i = 0; i < 6; i++) {
            generatedIds.add(TikTokRoomResolver.generateRandomDeviceId());
        }
        assertTrue("device_id must be generated dynamically rather than hardcoded", generatedIds.size() > 1);
    }

    @Test
    public void livePageUrlUsesConsistentWebClientParamsAndEncodesUsername() throws Exception {
        String fixedDeviceId = "7345678901234567890";
        String apiUrl = TikTokRoomResolver.buildRoomLookupUrl(".jejeangela", fixedDeviceId);
        String liveUrl = TikTokRoomResolver.buildLivePageUrl(" @.jejeangela ", fixedDeviceId);

        assertTrue(liveUrl.startsWith("https://www.tiktok.com/@.jejeangela/live?"));
        Map<String, String> apiParams = parseQuery(apiUrl.substring(apiUrl.indexOf('?') + 1));
        Map<String, String> liveParams = parseQuery(liveUrl.substring(liveUrl.indexOf('?') + 1));

        assertFalse(liveParams.containsKey("uniqueId"));
        assertFalse(liveParams.containsKey("sourceType"));
        assertEquals(fixedDeviceId, liveParams.get("device_id"));
        assertEquals(apiParams.get("aid"), liveParams.get("aid"));
        assertEquals(apiParams.get("app_name"), liveParams.get("app_name"));
        assertEquals(apiParams.get("browser_name"), liveParams.get("browser_name"));
        assertEquals(apiParams.get("browser_platform"), liveParams.get("browser_platform"));
        assertEquals(apiParams.get("browser_version"), liveParams.get("browser_version"));
        assertEquals(apiParams.get("device_platform"), liveParams.get("device_platform"));
        assertEquals(apiParams.get("os"), liveParams.get("os"));
        assertEquals(apiParams.get("referer"), liveParams.get("referer"));
        assertEquals(apiParams.get("root_referer"), liveParams.get("root_referer"));
    }

    @Test
    public void normalizeUsernameAcceptsDotsUnderscoresAndRejectsInvalidInput() {
        assertEquals(".jejeangela", TikTokRoomResolver.normalizeUsername("@.jejeangela"));
        assertEquals("user_name.1", TikTokRoomResolver.normalizeUsername("  @@user_name.1  "));
        assertEquals("", TikTokRoomResolver.normalizeUsername(""));
        assertEquals("", TikTokRoomResolver.normalizeUsername("invalid user"));
        assertEquals("", TikTokRoomResolver.normalizeUsername("user?x=1"));
    }

    @Test
    public void apiJsonWithStatusCodeZeroAndMissingStatusCodeRemainCompatible() {
        Map<String, String> cookies = new LinkedHashMap<>();
        AtomicInteger fallbackCalls = new AtomicInteger(0);
        TikTokRoomResolver.LiveHtmlFallback noFallback = (u, c) -> {
            fallbackCalls.incrementAndGet();
            return null;
        };

        String statusZeroJson = "{"
                + "\"statusCode\":0,"
                + "\"data\":{\"liveRoom\":{\"roomId\":\"74999888777\",\"status\":2,\"title\":\"Chill Stream\"}}"
                + "}";
        TikTokRoomResolver.Result resZero = TikTokRoomResolver.evaluateApiJsonResponse(
                ".jejeangela", statusZeroJson, 200, cookies, noFallback);
        assertEquals(TikTokRoomResolver.Status.RESOLVED_LIVE, resZero.status);
        assertEquals("74999888777", resZero.roomId);
        assertEquals("Chill Stream", resZero.roomTitle);
        assertEquals(0, fallbackCalls.get());

        String omittedStatusJson = "{"
                + "\"data\":{\"user\":{\"roomId\":\"74999888778\"},\"liveRoom\":{\"roomId\":\"74999888778\",\"status\":2}}"
                + "}";
        TikTokRoomResolver.Result resOmitted = TikTokRoomResolver.evaluateApiJsonResponse(
                ".jejeangela", omittedStatusJson, 200, cookies, noFallback);
        assertEquals(TikTokRoomResolver.Status.RESOLVED_LIVE, resOmitted.status);
        assertEquals("74999888778", resOmitted.roomId);
        assertEquals(0, fallbackCalls.get());
    }

    @Test
    public void apiJsonWithStatusCode19881005RejectsSuccessEvenWithDataAndTriggersHtmlFallback() {
        Map<String, String> cookies = new LinkedHashMap<>();
        cookies.put("ttwid", "secret-ttwid-value-123");
        AtomicInteger fallbackCalls = new AtomicInteger(0);

        String payloadWithDataAndErrorCode = "{"
                + "\"statusCode\":19881005,"
                + "\"data\":{\"liveRoom\":{\"roomId\":\"9999999\",\"status\":2}}"
                + "}";

        TikTokRoomResolver.Result resolvedViaFallback = TikTokRoomResolver.evaluateApiJsonResponse(
                ".jejeangela",
                payloadWithDataAndErrorCode,
                200,
                cookies,
                (user, cookieJar) -> {
                    fallbackCalls.incrementAndGet();
                    return new TikTokRoomResolver.Result(
                            TikTokRoomResolver.Status.RESOLVED_LIVE,
                            user,
                            "75111222333",
                            "Live from HTML",
                            2,
                            200,
                            "Room LIVE ditemukan via halaman publik @" + user + " (room_id=75111222333).",
                            cookieJar
                    );
                }
        );

        assertEquals(1, fallbackCalls.get());
        assertEquals(TikTokRoomResolver.Status.RESOLVED_LIVE, resolvedViaFallback.status);
        assertEquals("75111222333", resolvedViaFallback.roomId);
    }

    @Test
    public void apiJsonWithStatusCode19881005NeverClassifiesAsNotLiveWhenFallbackFails() {
        Map<String, String> cookies = new LinkedHashMap<>();
        cookies.put("ttwid", "sensitive-cookie-abc");
        AtomicInteger fallbackCalls = new AtomicInteger(0);

        String body19881005 = "{\"statusCode\":19881005,\"data\":{}}";
        TikTokRoomResolver.Result res = TikTokRoomResolver.evaluateApiJsonResponse(
                ".jejeangela",
                body19881005,
                200,
                cookies,
                (user, cookieJar) -> {
                    fallbackCalls.incrementAndGet();
                    return null;
                }
        );

        assertEquals(1, fallbackCalls.get());
        assertEquals(TikTokRoomResolver.Status.ROOM_UNREADABLE, res.status);
        assertTrue(res.message.contains("19881005"));
        assertFalse(res.message.contains("sensitive-cookie-abc"));
        assertFalse(res.message.contains("ttwid"));
        assertEquals("", res.roomId);
    }

    @Test
    public void apiJsonWithStatusCode10202MapsToAccountNotFound() {
        Map<String, String> cookies = new LinkedHashMap<>();
        AtomicInteger fallbackCalls = new AtomicInteger(0);

        String notFoundBody = "{\"statusCode\":10202,\"data\":{}}";
        TikTokRoomResolver.Result res = TikTokRoomResolver.evaluateApiJsonResponse(
                "missing_user",
                notFoundBody,
                200,
                cookies,
                (user, cookieJar) -> {
                    fallbackCalls.incrementAndGet();
                    return null;
                }
        );

        assertEquals(TikTokRoomResolver.Status.ACCOUNT_NOT_FOUND, res.status);
        assertEquals(0, fallbackCalls.get());
    }

    @Test
    public void htmlFallbackParsesSigiStateAndUniversalDataStructuresOffline() {
        Map<String, String> cookies = new LinkedHashMap<>();

        String sigiHtml = "<html><head><script id=\"SIGI_STATE\" type=\"application/json\">"
                + "{\"LiveRoom\":{\"liveRoomUserInfo\":{\"user\":{\"roomId\":\"74111111111\"},"
                + "\"liveRoom\":{\"roomId\":\"74111111111\",\"status\":2,\"title\":\"SIGI Title\"}}}}"
                + "</script></head></html>";
        TikTokRoomResolver.Result sigiRes = TikTokRoomResolver.parseLiveHtmlResponse(
                ".jejeangela", sigiHtml, 200, cookies);
        assertNotNull(sigiRes);
        assertEquals(TikTokRoomResolver.Status.RESOLVED_LIVE, sigiRes.status);
        assertEquals("74111111111", sigiRes.roomId);
        assertEquals("SIGI Title", sigiRes.roomTitle);

        String liveDetailHtml = "<html><head><script id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\">"
                + "{\"__DEFAULT_SCOPE__\":{\"webapp.live-detail\":{\"roomInfo\":"
                + "{\"roomId\":\"74222222222\",\"status\":2,\"title\":\"Universal Live\",\"anchor\":{\"uniqueId\":\".jejeangela\"}}}}}"
                + "</script></head></html>";
        TikTokRoomResolver.Result liveDetailRes = TikTokRoomResolver.parseLiveHtmlResponse(
                ".jejeangela", liveDetailHtml, 200, cookies);
        assertNotNull(liveDetailRes);
        assertEquals(TikTokRoomResolver.Status.RESOLVED_LIVE, liveDetailRes.status);
        assertEquals("74222222222", liveDetailRes.roomId);

        String userDetailHtml = "<html><head><script id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\">"
                + "{\"__DEFAULT_SCOPE__\":{\"webapp.user-detail\":{\"userInfo\":"
                + "{\"user\":{\"roomId\":\"74333333333\"}}}}}"
                + "</script></head></html>";
        TikTokRoomResolver.Result userDetailRes = TikTokRoomResolver.parseLiveHtmlResponse(
                ".jejeangela", userDetailHtml, 200, cookies);
        assertNotNull(userDetailRes);
        assertEquals(TikTokRoomResolver.Status.RESOLVED_LIVE, userDetailRes.status);
        assertEquals("74333333333", userDetailRes.roomId);
    }

    @Test
    public void htmlProfileWithoutRoomIdNeverReturnsNotLive() {
        Map<String, String> cookies = new LinkedHashMap<>();
        String userWithoutRoomJson = "{\"__DEFAULT_SCOPE__\":{\"webapp.user-detail\":{\"userInfo\":"
                + "{\"user\":{\"uniqueId\":\".jejeangela\",\"roomId\":\"\"}}}}}";

        TikTokRoomResolver.Result parsed = TikTokRoomResolver.parseSigiOrUniversalJson(
                ".jejeangela", userWithoutRoomJson, 200, cookies);
        assertNotNull(parsed);
        assertEquals(TikTokRoomResolver.Status.ROOM_UNREADABLE, parsed.status);

        String htmlWithoutRoom = "<html><head><script id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\">"
                + userWithoutRoomJson
                + "</script></head><body>no room id</body></html>";
        TikTokRoomResolver.Result htmlRes = TikTokRoomResolver.parseLiveHtmlResponse(
                ".jejeangela", htmlWithoutRoom, 200, cookies);
        assertNull(htmlRes);
    }

    @Test
    public void diagnosticMessagesNeverExposeAnonymousCookies() {
        Map<String, String> cookies = new LinkedHashMap<>();
        cookies.put("ttwid", "1%7Csecret_ttwid_token_98765");
        cookies.put("msToken", "secret_ms_token_4321");

        TikTokRoomResolver.Result errorResult = TikTokRoomResolver.evaluateApiJsonResponse(
                ".jejeangela",
                "{\"status_code\":19881005,\"message\":\"blocked\"}",
                200,
                cookies,
                (u, c) -> null
        );
        assertFalse(errorResult.message.contains("ttwid"));
        assertFalse(errorResult.message.contains("secret_ttwid_token_98765"));
        assertFalse(errorResult.message.contains("msToken"));
        assertFalse(errorResult.message.contains("secret_ms_token_4321"));
        assertEquals("1%7Csecret_ttwid_token_98765", errorResult.sessionCookies.get("ttwid"));
    }

    @Test
    public void cookieWarmUpDiagnosticsReportTtwidFoundOnHomepageWithoutLivePageCall() {
        List<String> requestedUrls = new ArrayList<>();
        TikTokRoomResolver.CookieWarmUpOutcome outcome =
                TikTokRoomResolver.fetchAnonymousDeviceCookiesWithDiagnostics(
                        ".jejeangela",
                        "7345678901234567890",
                        (url, accept, cookies, maxBytes) -> {
                            requestedUrls.add(url);
                            cookies.put("ttwid", "1%7Chomepage_secret_ttwid");
                            cookies.put("tt_csrf_token", "csrf_secret");
                            return new TikTokRoomResolver.HttpTextResponse(200, "<html></html>", true, 2);
                        }
                );

        assertEquals(1, requestedUrls.size());
        assertEquals("https://www.tiktok.com/", requestedUrls.get(0));
        assertEquals(Integer.valueOf(200), outcome.diagnostics.homepageHttpStatus);
        assertTrue(outcome.diagnostics.homepageHasSetCookie);
        assertEquals(2, outcome.diagnostics.homepageCookieCount);
        assertTrue(outcome.diagnostics.homepageHasTtwid);
        assertFalse(outcome.diagnostics.livePageAttempted);
        assertNull(outcome.diagnostics.livePageHttpStatus);
        assertNull(outcome.diagnostics.livePageHasSetCookie);
        assertNull(outcome.diagnostics.livePageCookieCount);
        assertNull(outcome.diagnostics.livePageHasTtwid);
        assertEquals("TTWID_FOUND_ON_HOMEPAGE", outcome.diagnostics.result);
    }

    @Test
    public void cookieWarmUpDiagnosticsFallbackOnceToLivePageAndMergeCookieJar() {
        List<String> requestedUrls = new ArrayList<>();
        List<Boolean> livePageSawHomepageCookie = new ArrayList<>();
        TikTokRoomResolver.CookieWarmUpOutcome outcome =
                TikTokRoomResolver.fetchAnonymousDeviceCookiesWithDiagnostics(
                        ".jejeangela",
                        "7345678901234567890",
                        (url, accept, cookies, maxBytes) -> {
                            requestedUrls.add(url);
                            if ("https://www.tiktok.com/".equals(url)) {
                                cookies.put("msToken", "home_ms_secret");
                                return new TikTokRoomResolver.HttpTextResponse(200, "<html></html>", true, 1);
                            }
                            livePageSawHomepageCookie.add(cookies.containsKey("msToken"));
                            cookies.put("ttwid", "1%7Clive_page_secret_ttwid");
                            return new TikTokRoomResolver.HttpTextResponse(200, "<html></html>", true, 1);
                        }
                );

        assertEquals(2, requestedUrls.size());
        assertEquals("https://www.tiktok.com/", requestedUrls.get(0));
        assertTrue(requestedUrls.get(1).startsWith("https://www.tiktok.com/@.jejeangela/live?"));
        assertEquals(1, livePageSawHomepageCookie.size());
        assertTrue(livePageSawHomepageCookie.get(0));

        assertEquals(Integer.valueOf(200), outcome.diagnostics.homepageHttpStatus);
        assertTrue(outcome.diagnostics.homepageHasSetCookie);
        assertEquals(1, outcome.diagnostics.homepageCookieCount);
        assertFalse(outcome.diagnostics.homepageHasTtwid);

        assertTrue(outcome.diagnostics.livePageAttempted);
        assertEquals(Integer.valueOf(200), outcome.diagnostics.livePageHttpStatus);
        assertEquals(Boolean.TRUE, outcome.diagnostics.livePageHasSetCookie);
        assertEquals(Integer.valueOf(1), outcome.diagnostics.livePageCookieCount);
        assertEquals(Boolean.TRUE, outcome.diagnostics.livePageHasTtwid);
        assertEquals("TTWID_FOUND_ON_LIVE_PAGE", outcome.diagnostics.result);
        assertEquals("home_ms_secret", outcome.cookies.get("msToken"));
        assertEquals("1%7Clive_page_secret_ttwid", outcome.cookies.get("ttwid"));
    }

    @Test
    public void cookieWarmUpDiagnosticsReportTtwidNotFoundWhenBothPagesReturn200WithoutTtwid() {
        List<String> requestedUrls = new ArrayList<>();
        TikTokRoomResolver.CookieWarmUpOutcome outcome =
                TikTokRoomResolver.fetchAnonymousDeviceCookiesWithDiagnostics(
                        ".jejeangela",
                        "7345678901234567890",
                        (url, accept, cookies, maxBytes) -> {
                            requestedUrls.add(url);
                            if ("https://www.tiktok.com/".equals(url)) {
                                cookies.put("tt_csrf_token", "csrf_1");
                                return new TikTokRoomResolver.HttpTextResponse(200, "<html></html>", true, 1);
                            }
                            return new TikTokRoomResolver.HttpTextResponse(200, "<html></html>", false, 0);
                        }
                );

        assertEquals(2, requestedUrls.size());
        assertEquals(Integer.valueOf(200), outcome.diagnostics.homepageHttpStatus);
        assertTrue(outcome.diagnostics.homepageHasSetCookie);
        assertEquals(1, outcome.diagnostics.homepageCookieCount);
        assertFalse(outcome.diagnostics.homepageHasTtwid);
        assertTrue(outcome.diagnostics.livePageAttempted);
        assertEquals(Integer.valueOf(200), outcome.diagnostics.livePageHttpStatus);
        assertEquals(Boolean.FALSE, outcome.diagnostics.livePageHasSetCookie);
        assertEquals(Integer.valueOf(0), outcome.diagnostics.livePageCookieCount);
        assertEquals(Boolean.FALSE, outcome.diagnostics.livePageHasTtwid);
        assertEquals("TTWID_NOT_FOUND", outcome.diagnostics.result);
    }

    @Test
    public void cookieWarmUpDiagnosticsHandleLivePageNotAttemptedAndWarmupFailedTruthfully() {
        TikTokRoomResolver.CookieWarmUpOutcome notAttempted =
                TikTokRoomResolver.fetchAnonymousDeviceCookiesWithDiagnostics(
                        "",
                        "7345678901234567890",
                        (url, accept, cookies, maxBytes) ->
                                new TikTokRoomResolver.HttpTextResponse(200, "<html></html>", false, 0)
                );
        assertFalse(notAttempted.diagnostics.livePageAttempted);
        assertNull(notAttempted.diagnostics.livePageHttpStatus);
        assertEquals("LIVE_PAGE_NOT_ATTEMPTED", notAttempted.diagnostics.result);

        TikTokRoomResolver.CookieWarmUpOutcome failed =
                TikTokRoomResolver.fetchAnonymousDeviceCookiesWithDiagnostics(
                        ".jejeangela",
                        "7345678901234567890",
                        (url, accept, cookies, maxBytes) -> {
                            throw new IOException("network timeout");
                        }
                );
        assertEquals(Integer.valueOf(0), failed.diagnostics.homepageHttpStatus);
        assertFalse(failed.diagnostics.homepageHasSetCookie);
        assertEquals(0, failed.diagnostics.homepageCookieCount);
        assertFalse(failed.diagnostics.homepageHasTtwid);
        assertTrue(failed.diagnostics.livePageAttempted);
        assertEquals(Integer.valueOf(0), failed.diagnostics.livePageHttpStatus);
        assertEquals(Boolean.FALSE, failed.diagnostics.livePageHasSetCookie);
        assertEquals(Integer.valueOf(0), failed.diagnostics.livePageCookieCount);
        assertEquals(Boolean.FALSE, failed.diagnostics.livePageHasTtwid);
        assertEquals("WARMUP_FAILED", failed.diagnostics.result);
    }

    private static Map<String, String> parseQuery(String rawQuery) throws Exception {
        Map<String, String> result = new HashMap<>();
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            String key = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8.name());
            String value = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8.name());
            result.put(key, value);
        }
        return result;
    }
}
