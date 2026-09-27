package wtf.chihuahua.huallet;

import java.util.Arrays;

/**
 * NFC Forum Type 4 Tag (T4T v2.0) answering one read-only NDEF message.
 * Pure APDU logic, no Android types, so it is unit-tested on the JVM.
 */
final class Type4Tag {

    static final byte[] NDEF_AID = hex("D2760000850101");
    static final byte[] OK = hex("9000");
    static final byte[] NOT_FOUND = hex("6A82");
    static final byte[] WRONG_PARAMS = hex("6B00");
    static final byte[] NOT_SUPPORTED = hex("6D00");

    private static final int CC_FILE = 0xE103;
    private static final int NDEF_FILE = 0xE104;
    static final int MAX_NDEF = 1024;

    // CCLEN 15, mapping 2.0, MLe 0x3B, MLc 0x34, NDEF file control TLV:
    // file E104, max size 1024, read open, write denied.
    static final byte[] CC = hex("000F20003B00340406E104040000FF");

    private byte[] ndefFile; // NLEN (2 bytes) + message; null = not emulating
    private boolean appSelected;
    private byte[] current;

    synchronized void setMessage(byte[] ndefMessage) {
        if (ndefMessage == null) {
            ndefFile = null;
        } else {
            if (ndefMessage.length > MAX_NDEF - 2) throw new IllegalArgumentException("NDEF message too large");
            ndefFile = new byte[ndefMessage.length + 2];
            ndefFile[0] = (byte) (ndefMessage.length >> 8);
            ndefFile[1] = (byte) ndefMessage.length;
            System.arraycopy(ndefMessage, 0, ndefFile, 2, ndefMessage.length);
        }
        reset();
    }

    synchronized boolean active() {
        return ndefFile != null;
    }

    synchronized void reset() {
        appSelected = false;
        current = null;
    }

    synchronized byte[] process(byte[] apdu) {
        if (ndefFile == null || apdu == null || apdu.length < 4) return NOT_FOUND;
        int cla = apdu[0] & 0xFF, ins = apdu[1] & 0xFF, p1 = apdu[2] & 0xFF, p2 = apdu[3] & 0xFF;
        if (cla != 0x00) return NOT_SUPPORTED;

        if (ins == 0xA4) { // SELECT
            int lc = apdu.length > 4 ? apdu[4] & 0xFF : 0;
            if (apdu.length < 5 + lc) return WRONG_PARAMS;
            byte[] data = Arrays.copyOfRange(apdu, 5, 5 + lc);
            if (p1 == 0x04) {
                appSelected = Arrays.equals(data, NDEF_AID);
                current = null;
                return appSelected ? OK : NOT_FOUND;
            }
            if (p1 == 0x00 && appSelected && lc == 2) {
                int id = ((data[0] & 0xFF) << 8) | (data[1] & 0xFF);
                if (id == CC_FILE) current = CC;
                else if (id == NDEF_FILE) current = ndefFile;
                else {
                    current = null;
                    return NOT_FOUND;
                }
                return OK;
            }
            return NOT_FOUND;
        }

        if (ins == 0xB0) { // READ BINARY
            if (current == null) return NOT_FOUND;
            int offset = (p1 << 8) | p2;
            int le = apdu.length > 4 ? apdu[4] & 0xFF : 0;
            if (le == 0) le = 256;
            if (offset > current.length) return WRONG_PARAMS;
            int n = Math.min(le, current.length - offset);
            byte[] out = new byte[n + 2];
            System.arraycopy(current, offset, out, 0, n);
            out[n] = (byte) 0x90;
            out[n + 1] = 0x00;
            return out;
        }

        return NOT_SUPPORTED;
    }

    static byte[] hex(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }
}
