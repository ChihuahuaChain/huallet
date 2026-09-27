package wtf.chihuahua.huallet;

import android.nfc.cardemulation.HostApduService;
import android.os.Bundle;

/** Presents the current payment request as an NFC Type 4 tag while the Receive screen asks for it. */
public class NdefHceService extends HostApduService {

    static final Type4Tag TAG = new Type4Tag();

    @Override
    public byte[] processCommandApdu(byte[] apdu, Bundle extras) {
        return TAG.process(apdu);
    }

    @Override
    public void onDeactivated(int reason) {
        TAG.reset();
    }
}
