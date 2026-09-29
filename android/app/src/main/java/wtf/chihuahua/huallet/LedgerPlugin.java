package wtf.chihuahua.huallet;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothStatusCodes;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.ParcelUuid;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Raw transport to a Ledger over USB (OTG cable, HID reports of 64 bytes) or
 * Bluetooth LE (GATT write + notifications). APDU framing is done in the page
 * (src/lib/ledger/framing.ts); this class only moves bytes. No key material
 * ever passes through here: the device signs and returns signatures.
 */
@CapacitorPlugin(
    name = "HualletLedger",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth"),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location")
    }
)
public class LedgerPlugin extends Plugin {

    static final int LEDGER_VENDOR_ID = 0x2c97;
    static final int HID_PACKET_SIZE = 64;
    private static final String USB_PERMISSION = "wtf.chihuahua.huallet.USB_PERMISSION";
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    /** Ledger BLE services: Nano X, Stax, Flex, Nano Gen5. Characteristics: +1 notify, +2 write. */
    static final String[][] BLE_SPECS = {
        { "13d63400-2c97-0004-0000-4c6564676572", "13d63400-2c97-0004-0001-4c6564676572", "13d63400-2c97-0004-0002-4c6564676572" },
        { "13d63400-2c97-6004-0000-4c6564676572", "13d63400-2c97-6004-0001-4c6564676572", "13d63400-2c97-6004-0002-4c6564676572" },
        { "13d63400-2c97-3004-0000-4c6564676572", "13d63400-2c97-3004-0001-4c6564676572", "13d63400-2c97-3004-0002-4c6564676572" },
        { "13d63400-2c97-8004-0000-4c6564676572", "13d63400-2c97-8004-0001-4c6564676572", "13d63400-2c97-8004-0002-4c6564676572" }
    };

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<String, BluetoothDevice> seenBle = new LinkedHashMap<>();
    private final LinkedBlockingQueue<byte[]> incoming = new LinkedBlockingQueue<>();

    private UsbDeviceConnection usbConn;
    private UsbInterface usbIface;
    private UsbEndpoint usbIn;
    private UsbEndpoint usbOut;
    private String usbName;

    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic bleWrite;
    private volatile CountDownLatch bleStep;
    private volatile int bleStatus;

    private String openKind;

    // ---------------------------------------------------------------- listing

    @PluginMethod
    public void list(PluginCall call) {
        if (needsBluetoothPermission()) {
            requestPermissionForAlias(bluetoothAlias(), call, "afterPermission");
            return;
        }
        doList(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        // Bluetooth refused: still offer USB devices.
        doList(call);
    }

    private String bluetoothAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? "bluetooth" : "location";
    }

    private boolean needsBluetoothPermission() {
        return bluetoothAdapter() != null && getPermissionState(bluetoothAlias()) != PermissionState.GRANTED;
    }

    private void doList(PluginCall call) {
        int scanMs = call.getInt("scanMs", 4000);
        io.execute(() -> {
            JSArray out = new JSArray();
            for (UsbDevice d : usbManager().getDeviceList().values()) {
                if (d.getVendorId() != LEDGER_VENDOR_ID) continue;
                out.put(device("usb:" + d.getDeviceName(), usbName(d), "usb"));
            }
            String bleError = null;
            try {
                for (BluetoothDevice d : scanBle(scanMs)) out.put(device("ble:" + d.getAddress(), bleName(d), "ble"));
            } catch (Exception e) {
                bleError = e.getMessage();
            }
            if (out.length() == 0 && bleError != null) {
                call.reject(bleError);
                return;
            }
            JSObject r = new JSObject();
            r.put("devices", out);
            call.resolve(r);
        });
    }

    private static JSObject device(String id, String name, String transport) {
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("name", name);
        o.put("transport", transport);
        return o;
    }

    private static String usbName(UsbDevice d) {
        String n = d.getProductName();
        return n != null && !n.isEmpty() ? n : "Ledger";
    }

    @SuppressLint("MissingPermission")
    private static String bleName(BluetoothDevice d) {
        try {
            String n = d.getName();
            return n != null && !n.isEmpty() ? n : "Ledger";
        } catch (SecurityException e) {
            return "Ledger";
        }
    }

    @SuppressLint("MissingPermission")
    private List<BluetoothDevice> scanBle(int scanMs) throws Exception {
        BluetoothAdapter adapter = bluetoothAdapter();
        if (adapter == null) return new ArrayList<>();
        if (getPermissionState(bluetoothAlias()) != PermissionState.GRANTED) throw new Exception("Bluetooth permission not granted.");
        if (!adapter.isEnabled()) throw new Exception("Bluetooth is off. Turn it on, or connect the Ledger with a USB cable.");
        BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) throw new Exception("Bluetooth scanner unavailable.");
        List<ScanFilter> filters = new ArrayList<>();
        for (String[] spec : BLE_SPECS) filters.add(new ScanFilter.Builder().setServiceUuid(ParcelUuid.fromString(spec[0])).build());
        ScanSettings settings = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
        Map<String, BluetoothDevice> found = new LinkedHashMap<>();
        ScanCallback cb = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                synchronized (found) {
                    found.put(result.getDevice().getAddress(), result.getDevice());
                }
            }
        };
        scanner.startScan(filters, settings, cb);
        try {
            Thread.sleep(scanMs);
        } finally {
            scanner.stopScan(cb);
        }
        // Bonded Ledgers that are connected elsewhere don't advertise; list them too.
        for (BluetoothDevice d : adapter.getBondedDevices()) {
            if (isLedgerName(bleName(d))) found.put(d.getAddress(), d);
        }
        synchronized (seenBle) {
            seenBle.putAll(found);
        }
        return new ArrayList<>(found.values());
    }

    static boolean isLedgerName(String n) {
        return n != null && (n.startsWith("Nano X") || n.startsWith("Ledger") || n.startsWith("Stax") || n.startsWith("Flex"));
    }

    // ---------------------------------------------------------------- open / close

    @PluginMethod
    public void open(PluginCall call) {
        String id = call.getString("id", "");
        io.execute(() -> {
            closeQuietly();
            try {
                JSObject d;
                if (id.startsWith("usb:")) d = openUsb(id.substring(4));
                else if (id.startsWith("ble:")) d = openBle(id.substring(4));
                else throw new Exception("Unknown device.");
                call.resolve(d);
            } catch (Exception e) {
                closeQuietly();
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        io.execute(() -> {
            closeQuietly();
            call.resolve();
        });
    }

    @SuppressLint("MissingPermission")
    private void closeQuietly() {
        if (usbConn != null) {
            try {
                if (usbIface != null) usbConn.releaseInterface(usbIface);
                usbConn.close();
            } catch (Exception ignored) {}
        }
        usbConn = null;
        usbIface = null;
        usbIn = null;
        usbOut = null;
        usbName = null;
        if (gatt != null) {
            try {
                gatt.disconnect();
                gatt.close();
            } catch (Exception ignored) {}
        }
        gatt = null;
        bleWrite = null;
        openKind = null;
        incoming.clear();
    }

    // ---------------------------------------------------------------- USB

    private UsbManager usbManager() {
        return (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    }

    private JSObject openUsb(String deviceName) throws Exception {
        UsbManager mgr = usbManager();
        UsbDevice dev = mgr.getDeviceList().get(deviceName);
        if (dev == null || dev.getVendorId() != LEDGER_VENDOR_ID) throw new Exception("Ledger not connected over USB.");
        if (!mgr.hasPermission(dev) && !requestUsbPermission(mgr, dev)) throw new Exception("USB access to the Ledger was not allowed.");

        UsbInterface iface = null;
        UsbEndpoint in = null;
        UsbEndpoint out = null;
        for (int i = 0; i < dev.getInterfaceCount() && iface == null; i++) {
            UsbInterface candidate = dev.getInterface(i);
            if (candidate.getInterfaceClass() != UsbConstants.USB_CLASS_HID) continue;
            UsbEndpoint ci = null;
            UsbEndpoint co = null;
            for (int e = 0; e < candidate.getEndpointCount(); e++) {
                UsbEndpoint ep = candidate.getEndpoint(e);
                if (ep.getType() != UsbConstants.USB_ENDPOINT_XFER_INT) continue;
                if (ep.getDirection() == UsbConstants.USB_DIR_IN) ci = ep;
                else co = ep;
            }
            if (ci != null && co != null) {
                iface = candidate;
                in = ci;
                out = co;
            }
        }
        if (iface == null) throw new Exception("This Ledger exposes no HID interface.");
        UsbDeviceConnection conn = mgr.openDevice(dev);
        if (conn == null) throw new Exception("Could not open the Ledger over USB.");
        if (!conn.claimInterface(iface, true)) {
            conn.close();
            throw new Exception("The Ledger is busy (another app is using it).");
        }
        usbConn = conn;
        usbIface = iface;
        usbIn = in;
        usbOut = out;
        usbName = deviceName;
        openKind = "usb";
        return device("usb:" + deviceName, usbName(dev), "usb");
    }

    private boolean requestUsbPermission(UsbManager mgr, UsbDevice dev) throws InterruptedException {
        CountDownLatch done = new CountDownLatch(1);
        boolean[] granted = { false };
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (!USB_PERMISSION.equals(intent.getAction())) return;
                granted[0] = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                done.countDown();
            }
        };
        ContextCompat.registerReceiver(getContext(), receiver, new IntentFilter(USB_PERMISSION), ContextCompat.RECEIVER_NOT_EXPORTED);
        try {
            Intent intent = new Intent(USB_PERMISSION).setPackage(getContext().getPackageName());
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
            mgr.requestPermission(dev, PendingIntent.getBroadcast(getContext(), 0, intent, flags));
            done.await(60, TimeUnit.SECONDS);
            return granted[0];
        } finally {
            getContext().unregisterReceiver(receiver);
        }
    }

    // ---------------------------------------------------------------- Bluetooth LE

    private BluetoothAdapter bluetoothAdapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m != null ? m.getAdapter() : null;
    }

    @SuppressLint("MissingPermission")
    private JSObject openBle(String address) throws Exception {
        BluetoothAdapter adapter = bluetoothAdapter();
        if (adapter == null) throw new Exception("This phone has no Bluetooth.");
        if (getPermissionState(bluetoothAlias()) != PermissionState.GRANTED) throw new Exception("Bluetooth permission not granted.");
        if (!adapter.isEnabled()) throw new Exception("Bluetooth is off.");
        BluetoothDevice dev;
        synchronized (seenBle) {
            dev = seenBle.get(address);
        }
        if (dev == null) dev = adapter.getRemoteDevice(address);

        bleStep = new CountDownLatch(1);
        bleStatus = -1;
        gatt = dev.connectGatt(getContext(), false, gattCallback, BluetoothDevice.TRANSPORT_LE);
        if (!bleStep.await(15, TimeUnit.SECONDS) || bleStatus != BluetoothGatt.GATT_SUCCESS) {
            throw new Exception("Could not reach the Ledger over Bluetooth. Unlock it, open the Cosmos app and keep it close.");
        }

        bleStep = new CountDownLatch(1);
        gatt.discoverServices();
        if (!bleStep.await(15, TimeUnit.SECONDS) || bleStatus != BluetoothGatt.GATT_SUCCESS) throw new Exception("Bluetooth service discovery failed.");

        BluetoothGattCharacteristic notify = null;
        for (String[] spec : BLE_SPECS) {
            BluetoothGattService s = gatt.getService(UUID.fromString(spec[0]));
            if (s == null) continue;
            notify = s.getCharacteristic(UUID.fromString(spec[1]));
            bleWrite = s.getCharacteristic(UUID.fromString(spec[2]));
            break;
        }
        if (notify == null || bleWrite == null) throw new Exception("This Bluetooth device is not a Ledger.");

        bleStep = new CountDownLatch(1);
        gatt.requestMtu(247);
        bleStep.await(5, TimeUnit.SECONDS);

        // Subscribing needs an encrypted link: the first time, Android shows the pairing request.
        gatt.setCharacteristicNotification(notify, true);
        BluetoothGattDescriptor cccd = notify.getDescriptor(CCCD);
        if (cccd == null) throw new Exception("Ledger notifications unavailable.");
        bleStep = new CountDownLatch(1);
        if (Build.VERSION.SDK_INT >= 33) {
            gatt.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
        } else {
            cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
            gatt.writeDescriptor(cccd);
        }
        if (!bleStep.await(60, TimeUnit.SECONDS) || bleStatus != BluetoothGatt.GATT_SUCCESS) {
            throw new Exception("Bluetooth pairing with the Ledger did not complete. Confirm the code on both screens and try again.");
        }
        openKind = "ble";
        return device("ble:" + address, bleName(dev), "ble");
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                bleStatus = status;
                release();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                bleStatus = status == BluetoothGatt.GATT_SUCCESS ? -2 : status;
                incoming.offer(new byte[0]);
                release();
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            bleStatus = status;
            release();
        }

        @Override
        public void onMtuChanged(BluetoothGatt g, int mtu, int status) {
            release();
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
            bleStatus = status;
            release();
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            bleStatus = status;
            release();
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value) {
            incoming.offer(value.clone());
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
            if (Build.VERSION.SDK_INT < 33) incoming.offer(c.getValue().clone());
        }

        private void release() {
            CountDownLatch l = bleStep;
            if (l != null) l.countDown();
        }
    };

    // ---------------------------------------------------------------- I/O

    @PluginMethod
    public void write(PluginCall call) {
        byte[] data = Hex.decode(call.getString("data", ""));
        io.execute(() -> {
            try {
                if ("usb".equals(openKind)) writeUsb(data);
                else if ("ble".equals(openKind)) writeBle(data);
                else throw new Exception("No Ledger open.");
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    private void writeUsb(byte[] data) throws Exception {
        byte[] packet = new byte[HID_PACKET_SIZE];
        System.arraycopy(data, 0, packet, 0, Math.min(data.length, HID_PACKET_SIZE));
        int n = usbConn.bulkTransfer(usbOut, packet, packet.length, 2000);
        if (n < 0) throw new Exception("The Ledger was disconnected.");
    }

    @SuppressLint("MissingPermission")
    @SuppressWarnings("deprecation")
    private void writeBle(byte[] data) throws Exception {
        bleStep = new CountDownLatch(1);
        bleStatus = -1;
        boolean started;
        if (Build.VERSION.SDK_INT >= 33) {
            started = gatt.writeCharacteristic(bleWrite, data, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == BluetoothStatusCodes.SUCCESS;
        } else {
            bleWrite.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            bleWrite.setValue(data);
            started = gatt.writeCharacteristic(bleWrite);
        }
        if (!started || !bleStep.await(10, TimeUnit.SECONDS) || bleStatus != BluetoothGatt.GATT_SUCCESS) {
            throw new Exception("The Ledger was disconnected.");
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        long timeoutMs = call.getInt("timeoutMs", 30000);
        String kind = openKind;
        if (kind == null) {
            call.reject("No Ledger open.");
            return;
        }
        // Reads block until the user confirms on the device, so they run on their own thread
        // and don't hold up writes or close().
        new Thread(() -> {
            try {
                byte[] r = "usb".equals(kind) ? readUsb(timeoutMs) : readBle(timeoutMs);
                JSObject o = new JSObject();
                o.put("data", Hex.encode(r));
                call.resolve(o);
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        }, "ledger-read").start();
    }

    private byte[] readUsb(long timeoutMs) throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMs;
        byte[] buf = new byte[HID_PACKET_SIZE];
        while (System.currentTimeMillis() < deadline) {
            UsbDeviceConnection conn = usbConn;
            if (conn == null) throw new Exception("The Ledger was disconnected.");
            int n = conn.bulkTransfer(usbIn, buf, buf.length, 1000);
            if (n > 0) {
                byte[] out = new byte[n];
                System.arraycopy(buf, 0, out, 0, n);
                return out;
            }
            String name = usbName;
            if (name == null || !usbManager().getDeviceList().containsKey(name)) throw new Exception("The Ledger was disconnected.");
        }
        throw new Exception("Timed out waiting for the Ledger.");
    }

    private byte[] readBle(long timeoutMs) throws Exception {
        byte[] r = incoming.poll(timeoutMs, TimeUnit.MILLISECONDS);
        if (r == null) throw new Exception("Timed out waiting for the Ledger.");
        if (r.length == 0) throw new Exception("The Ledger was disconnected.");
        return r;
    }

    @Override
    protected void handleOnDestroy() {
        closeQuietly();
        io.shutdownNow();
    }

    static final class Hex {
        static String encode(byte[] b) {
            StringBuilder sb = new StringBuilder(b.length * 2);
            for (byte x : b) sb.append(String.format("%02x", x & 0xff));
            return sb.toString();
        }

        static byte[] decode(String s) {
            if (s.length() % 2 != 0) throw new IllegalArgumentException("odd hex length");
            byte[] out = new byte[s.length() / 2];
            for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
            return out;
        }
    }
}
