package com.syntxrr.streamtools;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** Offline unit tests for RFC 6455 handshake validation, body classification, and header sanitization. */
public class TikTokWebSocketHandshakeDiagnosticsTest {

    private static final String TEST_WS_KEY = "dGhlIHNhbXBsZSBub25jZQ==";

    @Test
    public void validHttp101PassesRfc6455WithoutReadingFramesAsErrorBody() throws Exception {
        String expectedAccept = TikTokWebSocketTransport.computeAcceptKey(TEST_WS_KEY);
        String raw = "HTTP/1.1 101 Switching Protocols\r\n"
                + "Upgrade: websocket\r\n"
                + "Connection: Upgrade\r\n"
                + "Sec-WebSocket-Accept: " + expectedAccept + "\r\n"
                + "Server: tiktok-ws-edge\r\n"
                + "\r\n"
                + "BINARY_FRAME_TRAILING_BYTES";

        InputStream in = new ByteArrayInputStream(raw.getBytes(StandardCharsets.ISO_8859_1));
        TikTokWebSocketTransport.HandshakeEvaluation eval =
                TikTokWebSocketTransport.readAndEvaluateHandshake("webcast-ws.tiktok.com", in, TEST_WS_KEY);

        assertTrue(eval.accepted);
        assertEquals(101, eval.diagnostics.httpStatus);
        assertEquals("webcast-ws.tiktok.com", eval.diagnostics.attemptedHost);
        assertTrue(eval.diagnostics.hasSecWebSocketAccept);
        assertEquals(0, eval.diagnostics.bodyBytes);
        assertEquals("", eval.diagnostics.rejectionReason);
        // Trailing WebSocket bytes must remain unread in stream for frame loop.
        assertEquals('B', in.read());
    }

    @Test
    public void http200WithHtmlIsRejectedAndClassifiedAsEdgeHtml() throws Exception {
        String htmlBody = "<!DOCTYPE html><html><head><title>TikTok Edge</title></head>"
                + "<body><script>window._secret='abc';</script>Verify challenge</body></html>";
        String raw = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: text/html; charset=utf-8\r\n"
                + "Server: AkamaiGHost\r\n"
                + "Content-Length: " + htmlBody.getBytes(StandardCharsets.UTF_8).length + "\r\n"
                + "Set-Cookie: ttwid=super_secret_cookie_value; Path=/; HttpOnly\r\n"
                + "\r\n"
                + htmlBody;

        InputStream in = new ByteArrayInputStream(raw.getBytes(StandardCharsets.UTF_8));
        TikTokWebSocketTransport.HandshakeEvaluation eval =
                TikTokWebSocketTransport.readAndEvaluateHandshake("webcast-ws.tiktok.com", in, TEST_WS_KEY);

        assertFalse(eval.accepted);
        assertEquals(200, eval.diagnostics.httpStatus);
        assertEquals("webcast-ws.tiktok.com", eval.diagnostics.attemptedHost);
        assertEquals("text/html; charset=utf-8", eval.diagnostics.contentType);
        assertEquals("AkamaiGHost", eval.diagnostics.serverHeader);
        assertFalse(eval.diagnostics.hasSecWebSocketAccept);
        assertEquals("html", eval.diagnostics.bodyKind);
        assertEquals("edge_html", eval.diagnostics.responseClass);
        assertEquals(htmlBody.getBytes(StandardCharsets.UTF_8).length, eval.diagnostics.bodyBytes);
        assertFalse(eval.diagnostics.rejectionReason.contains("super_secret_cookie_value"));
        assertFalse(eval.diagnostics.rejectionReason.contains("Verify challenge"));
        assertFalse(eval.diagnostics.rejectionReason.contains(TEST_WS_KEY));
    }

    @Test
    public void http200WithJsonIsRejectedAndClassifiedAsApiJson() throws Exception {
        String jsonBody = "{\"status_code\":19881005,\"message\":\"access denied\",\"token\":\"secret_tok\"}";
        String raw = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: application/json\r\n"
                + "Transfer-Encoding: chunked\r\n"
                + "\r\n"
                + Integer.toHexString(jsonBody.getBytes(StandardCharsets.UTF_8).length) + "\r\n"
                + jsonBody + "\r\n"
                + "0\r\n\r\n";

        InputStream in = new ByteArrayInputStream(raw.getBytes(StandardCharsets.UTF_8));
        TikTokWebSocketTransport.HandshakeEvaluation eval =
                TikTokWebSocketTransport.readAndEvaluateHandshake("webcast-ws.us.tiktok.com", in, TEST_WS_KEY);

        assertFalse(eval.accepted);
        assertEquals(200, eval.diagnostics.httpStatus);
        assertEquals("webcast-ws.us.tiktok.com", eval.diagnostics.attemptedHost);
        assertEquals("application/json", eval.diagnostics.contentType);
        assertEquals("json", eval.diagnostics.bodyKind);
        assertEquals("api_json", eval.diagnostics.responseClass);
        assertEquals(jsonBody.getBytes(StandardCharsets.UTF_8).length, eval.diagnostics.bodyBytes);
        assertFalse(eval.diagnostics.rejectionReason.contains("secret_tok"));
    }

    @Test
    public void http301And302RedirectsAreClassifiedAndStripSensitiveQueryAndFragment() throws Exception {
        String raw302 = "HTTP/1.1 302 Found\r\n"
                + "Location: https://www.tiktok.com/verify/captcha?ttwid=secret_cookie&token=abc#frag123\r\n"
                + "Content-Length: 0\r\n"
                + "\r\n";

        TikTokWebSocketTransport.HandshakeEvaluation eval302 =
                TikTokWebSocketTransport.readAndEvaluateHandshake(
                        "webcast-ws.tiktok.com",
                        new ByteArrayInputStream(raw302.getBytes(StandardCharsets.ISO_8859_1)),
                        TEST_WS_KEY
                );

        assertFalse(eval302.accepted);
        assertEquals(302, eval302.diagnostics.httpStatus);
        assertEquals("redirect", eval302.diagnostics.responseClass);
        assertEquals("www.tiktok.com/verify/captcha", eval302.diagnostics.redirectLocation);
        assertFalse(eval302.diagnostics.redirectLocation.contains("secret_cookie"));
        assertFalse(eval302.diagnostics.redirectLocation.contains("frag123"));
        assertFalse(eval302.diagnostics.rejectionReason.contains("secret_cookie"));

        String raw301 = "HTTP/1.1 301 Moved Permanently\r\n"
                + "Location: //webcast-ws.us.tiktok.com/ws/v2?sessionid=xyz#step\r\n"
                + "Content-Length: 0\r\n"
                + "\r\n";
        TikTokWebSocketTransport.HandshakeEvaluation eval301 =
                TikTokWebSocketTransport.readAndEvaluateHandshake(
                        "webcast-ws.tiktok.com",
                        new ByteArrayInputStream(raw301.getBytes(StandardCharsets.ISO_8859_1)),
                        TEST_WS_KEY
                );
        assertFalse(eval301.accepted);
        assertEquals(301, eval301.diagnostics.httpStatus);
        assertEquals("redirect", eval301.diagnostics.responseClass);
        assertEquals("webcast-ws.us.tiktok.com/ws/v2", eval301.diagnostics.redirectLocation);
    }

    @Test
    public void http403And429ClassifyAsProtocolRejected() throws Exception {
        String raw403 = "HTTP/1.1 403 Forbidden\r\n"
                + "Content-Type: text/plain\r\n"
                + "Server: nginx\r\n"
                + "Content-Length: 9\r\n"
                + "\r\n"
                + "Forbidden";
        TikTokWebSocketTransport.HandshakeEvaluation eval403 =
                TikTokWebSocketTransport.readAndEvaluateHandshake(
                        "webcast-ws.tiktok.com",
                        new ByteArrayInputStream(raw403.getBytes(StandardCharsets.UTF_8)),
                        TEST_WS_KEY
                );
        assertFalse(eval403.accepted);
        assertEquals(403, eval403.diagnostics.httpStatus);
        assertEquals("protocol_rejected", eval403.diagnostics.responseClass);
        assertEquals("plain_text", eval403.diagnostics.bodyKind);
        assertEquals("nginx", eval403.diagnostics.serverHeader);

        String raw429 = "HTTP/1.1 429 Too Many Requests\r\n"
                + "Content-Length: 0\r\n"
                + "\r\n";
        TikTokWebSocketTransport.HandshakeEvaluation eval429 =
                TikTokWebSocketTransport.readAndEvaluateHandshake(
                        "webcast-ws.tiktok.com",
                        new ByteArrayInputStream(raw429.getBytes(StandardCharsets.UTF_8)),
                        TEST_WS_KEY
                );
        assertFalse(eval429.accepted);
        assertEquals(429, eval429.diagnostics.httpStatus);
        assertEquals("protocol_rejected", eval429.diagnostics.responseClass);
        assertEquals("empty", eval429.diagnostics.bodyKind);
    }

    @Test
    public void missingUpgradeHeaderRejectsBothHttp101AndHttp200AsUpgradeMissing() throws Exception {
        String expectedAccept = TikTokWebSocketTransport.computeAcceptKey(TEST_WS_KEY);
        String raw101NoUpgrade = "HTTP/1.1 101 Switching Protocols\r\n"
                + "Connection: Upgrade\r\n"
                + "Sec-WebSocket-Accept: " + expectedAccept + "\r\n"
                + "\r\n";
        TikTokWebSocketTransport.HandshakeEvaluation eval101 =
                TikTokWebSocketTransport.readAndEvaluateHandshake(
                        "webcast-ws.tiktok.com",
                        new ByteArrayInputStream(raw101NoUpgrade.getBytes(StandardCharsets.ISO_8859_1)),
                        TEST_WS_KEY
                );
        assertFalse(eval101.accepted);
        assertEquals(101, eval101.diagnostics.httpStatus);
        assertEquals("upgrade_missing", eval101.diagnostics.responseClass);
        assertEquals("", eval101.diagnostics.upgradeHeader);

        String raw200NoUpgrade = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: text/plain\r\n"
                + "Content-Length: 2\r\n"
                + "\r\n"
                + "OK";
        TikTokWebSocketTransport.HandshakeEvaluation eval200 =
                TikTokWebSocketTransport.readAndEvaluateHandshake(
                        "webcast-ws.tiktok.com",
                        new ByteArrayInputStream(raw200NoUpgrade.getBytes(StandardCharsets.UTF_8)),
                        TEST_WS_KEY
                );
        assertFalse(eval200.accepted);
        assertEquals(200, eval200.diagnostics.httpStatus);
        assertEquals("upgrade_missing", eval200.diagnostics.responseClass);
        assertEquals("plain_text", eval200.diagnostics.bodyKind);
    }

    @Test
    public void invalidSecWebSocketAcceptRejectsHttp101AsProtocolRejected() throws Exception {
        String rawBadAccept = "HTTP/1.1 101 Switching Protocols\r\n"
                + "Upgrade: websocket\r\n"
                + "Connection: Upgrade\r\n"
                + "Sec-WebSocket-Accept: invalid-accept-value\r\n"
                + "\r\n";
        TikTokWebSocketTransport.HandshakeEvaluation eval =
                TikTokWebSocketTransport.readAndEvaluateHandshake(
                        "webcast-ws.tiktok.com",
                        new ByteArrayInputStream(rawBadAccept.getBytes(StandardCharsets.ISO_8859_1)),
                        TEST_WS_KEY
                );

        assertFalse(eval.accepted);
        assertEquals(101, eval.diagnostics.httpStatus);
        assertTrue(eval.diagnostics.hasSecWebSocketAccept);
        assertEquals("protocol_rejected", eval.diagnostics.responseClass);
        assertFalse(eval.diagnostics.rejectionReason.contains(TEST_WS_KEY));
    }

    @Test
    public void bodySamplingIsStrictlyCappedAt4KbAndSensitiveHeadersAreSanitized() throws Exception {
        StringBuilder largeHtml = new StringBuilder("<!DOCTYPE html><html><body>");
        for (int i = 0; i < 6000; i++) {
            largeHtml.append('A');
        }
        largeHtml.append("</body></html>");

        String rawLarge = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: text/html\r\n"
                + "Server: edge token=supersecret123 Bearer abc.def.ghi\r\n"
                + "Authorization: Bearer topsecret\r\n"
                + "Content-Length: " + largeHtml.length() + "\r\n"
                + "\r\n"
                + largeHtml;

        TikTokWebSocketTransport.HandshakeEvaluation eval =
                TikTokWebSocketTransport.readAndEvaluateHandshake(
                        "webcast-ws.tiktok.com",
                        new ByteArrayInputStream(rawLarge.getBytes(StandardCharsets.UTF_8)),
                        TEST_WS_KEY
                );

        assertFalse(eval.accepted);
        assertEquals(TikTokWebSocketTransport.MAX_DIAGNOSTIC_BODY_BYTES, eval.diagnostics.bodyBytes);
        assertEquals("html", eval.diagnostics.bodyKind);
        assertEquals("edge_html", eval.diagnostics.responseClass);
        assertFalse(eval.diagnostics.serverHeader.contains("supersecret123"));
        assertFalse(eval.diagnostics.serverHeader.contains("abc.def.ghi"));
        assertFalse(eval.diagnostics.rejectionReason.contains("topsecret"));
        assertEquals("", TikTokWebSocketTransport.sanitizeRedirectLocation("javascript:alert(1)"));
        assertEquals("/challenge/step1",
                TikTokWebSocketTransport.sanitizeRedirectLocation("/challenge/step1?token=secret#hash"));
    }

    @Test
    public void capturesSanitizedHandshakeStatusAndMessageOnHttp200Rejection() throws Exception {
        String raw = "HTTP/1.1 200 OK\r\n"
                + "Content-Length: 0\r\n"
                + "Handshake-Status: 1004\r\n"
                + "Handshake-Msg: missing_ttwid token=super_secret_val\r\n"
                + "\r\n";

        TikTokWebSocketTransport.HandshakeEvaluation eval =
                TikTokWebSocketTransport.readAndEvaluateHandshake(
                        "webcast-ws.us.tiktok.com",
                        new ByteArrayInputStream(raw.getBytes(StandardCharsets.ISO_8859_1)),
                        TEST_WS_KEY
                );

        assertFalse(eval.accepted);
        assertEquals(200, eval.diagnostics.httpStatus);
        assertEquals("upgrade_missing", eval.diagnostics.responseClass);
        assertEquals("empty", eval.diagnostics.bodyKind);
        assertEquals(0, eval.diagnostics.bodyBytes);
        assertTrue(eval.diagnostics.rejectionReason.contains("handshake-status=1004"));
        assertTrue(eval.diagnostics.rejectionReason.contains("missing_ttwid"));
        assertFalse(eval.diagnostics.rejectionReason.contains("super_secret_val"));
    }
}
