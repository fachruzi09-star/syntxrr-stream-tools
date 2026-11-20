# Mode B V14 — MP4 frame decode argument order

The V13 native MP4 decoder passed the four integer arguments to
`MediaMetadataRetriever.getScaledFrameAtTime()` in the wrong order. Android's API is:

`getScaledFrameAtTime(timeUs, option, dstWidth, dstHeight)`.

V14 now passes the playback timestamp in microseconds, `OPTION_CLOSEST`, then the
maximum output width and height (1280 x 720). The old call supplied 1280 as the
option value, which is not a valid frame-search option and can throw
`IllegalArgumentException` on supported Android versions.

`ModeBVideoFrameRequestTest` verifies the exact argument ordering independently
of Android framework classes. This is a source-level regression test; actual MP4
decoding and RTMP compositing still require an Android device build and runtime test.
