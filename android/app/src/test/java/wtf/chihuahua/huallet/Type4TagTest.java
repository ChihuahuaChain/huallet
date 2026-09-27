package wtf.chihuahua.huallet;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import java.io.ByteArrayOutputStream;
import java.util.Arrays;
import org.junit.Test;

public class Type4TagTest {

    private static final byte[] SELECT_APP = Type4Tag.hex("00A4040007D276000085010100");
    private static final byte[] SELECT_CC = Type4Tag.hex("00A4000C02E103");
    private static final byte[] SELECT_NDEF = Type4Tag.hex("00A4000C02E104");

    private static byte[] read(int offset, int le) {
        return new byte[] { 0x00, (byte) 0xB0, (byte) (offset >> 8), (byte) offset, (byte) le };
    }

    private static byte[] body(byte[] resp) {
        assertEquals((byte) 0x90, resp[resp.length - 2]);
        assertEquals((byte) 0x00, resp[resp.length - 1]);
        return Arrays.copyOf(resp, resp.length - 2);
    }

    @Test
    public void silentWhenNotEmulating() {
        Type4Tag tag = new Type4Tag();
        assertArrayEquals(Type4Tag.NOT_FOUND, tag.process(SELECT_APP));
    }

    @Test
    public void readsTheNdefMessageLikeAPhoneReader() {
        byte[] message = new byte[300];
        for (int i = 0; i < message.length; i++) message[i] = (byte) i;
        Type4Tag tag = new Type4Tag();
        tag.setMessage(message);

        assertArrayEquals(Type4Tag.OK, tag.process(SELECT_APP));
        assertArrayEquals(Type4Tag.OK, tag.process(SELECT_CC));
        byte[] cc = body(tag.process(read(0, 15)));
        assertArrayEquals(Type4Tag.CC, cc);
        assertEquals(15, cc.length);

        assertArrayEquals(Type4Tag.OK, tag.process(SELECT_NDEF));
        byte[] nlen = body(tag.process(read(0, 2)));
        int n = ((nlen[0] & 0xFF) << 8) | (nlen[1] & 0xFF);
        assertEquals(300, n);

        // Read in MLe-sized chunks, as Android and iOS readers do.
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (int off = 2; off < n + 2; off += 0x3B) out.writeBytes(body(tag.process(read(off, Math.min(0x3B, n + 2 - off)))));
        assertArrayEquals(message, out.toByteArray());
    }

    @Test
    public void refusesFilesBeforeTheAppIsSelectedAndUnknownOnes() {
        Type4Tag tag = new Type4Tag();
        tag.setMessage(new byte[] { 1, 2, 3 });
        assertArrayEquals(Type4Tag.NOT_FOUND, tag.process(SELECT_NDEF));
        assertArrayEquals(Type4Tag.NOT_FOUND, tag.process(Type4Tag.hex("00A4040007A000000003101000")));
        assertArrayEquals(Type4Tag.OK, tag.process(SELECT_APP));
        assertArrayEquals(Type4Tag.NOT_FOUND, tag.process(Type4Tag.hex("00A4000C02E105")));
        assertArrayEquals(Type4Tag.NOT_SUPPORTED, tag.process(Type4Tag.hex("00D6000003AABBCC")));
    }

    @Test
    public void stopsAnsweringWhenCleared() {
        Type4Tag tag = new Type4Tag();
        tag.setMessage(new byte[] { 1 });
        tag.setMessage(null);
        assertArrayEquals(Type4Tag.NOT_FOUND, tag.process(SELECT_APP));
    }
}
