package app.vitrola.music;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import androidx.mediarouter.app.SystemOutputSwitcherDialogController;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Saídas de áudio do aparelho (alto-falante, fone, Bluetooth, USB, HDMI).
 *
 * O som do app sai do WebView, que segue a rota de mídia do sistema: não dá para mandar
 * só o `<audio>` para um dispositivo. Por isso a troca é feita pelo seletor do sistema
 * ("Tocar em"), e o app só lista o que está conectado e qual é a saída atual.
 * Alexa/Echo entra aqui como caixa Bluetooth ("Alexa, parear Bluetooth").
 */
@CapacitorPlugin(name = "AudioOutput")
public class AudioOutputPlugin extends Plugin {

    private AudioManager audio;

    private final AudioDeviceCallback deviceCallback = new AudioDeviceCallback() {
        @Override
        public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
            notifyListeners("outputsChanged", outputs());
        }

        @Override
        public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
            notifyListeners("outputsChanged", outputs());
        }
    };

    @Override
    public void load() {
        audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        audio.registerAudioDeviceCallback(deviceCallback, new Handler(Looper.getMainLooper()));
    }

    @Override
    protected void handleOnDestroy() {
        if (audio != null) audio.unregisterAudioDeviceCallback(deviceCallback);
    }

    @PluginMethod
    public void list(PluginCall call) {
        call.resolve(outputs());
    }

    /** Abre o seletor de saída do sistema. Sem ele (versões/ROMs antigas), abre o Bluetooth. */
    @PluginMethod
    public void showSystemPicker(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean shown = false;
            try {
                shown = SystemOutputSwitcherDialogController.showDialog(getActivity());
            } catch (RuntimeException ignored) {
                // Algumas ROMs não têm o diálogo: cai no Bluetooth abaixo.
            }
            if (!shown) shown = openBluetooth();
            JSObject r = new JSObject();
            r.put("shown", shown);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject r = new JSObject();
            r.put("shown", openBluetooth());
            call.resolve(r);
        });
    }

    private boolean openBluetooth() {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    private JSObject outputs() {
        Set<Integer> active = activeDeviceIds();
        // Um mesmo aparelho aparece mais de uma vez (ex.: Bluetooth A2DP e BLE): agrupa por tipo + nome.
        Map<String, JSObject> byKey = new LinkedHashMap<>();
        boolean anyActive = false;
        for (AudioDeviceInfo d : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            String kind = kindOf(d.getType());
            if (kind == null) continue;
            String name = "speaker".equals(kind) ? "Este aparelho" : String.valueOf(d.getProductName()).trim();
            if (name.isEmpty()) name = defaultName(kind);
            String key = kind + "|" + name;
            JSObject o = byKey.get(key);
            if (o == null) {
                o = new JSObject();
                o.put("id", String.valueOf(d.getId()));
                o.put("name", name);
                o.put("kind", kind);
                o.put("active", false);
                byKey.put(key, o);
            }
            if (active.contains(d.getId())) {
                o.put("active", true);
                anyActive = true;
            }
        }
        // Antes do Android 13 não há como perguntar a rota: usa a prioridade do próprio Android.
        if (!anyActive) {
            for (String kind : new String[] { "bluetooth", "usb", "wired", "hdmi", "other", "speaker" }) {
                JSObject first = byKey.values().stream().filter(o -> kind.equals(o.getString("kind"))).findFirst().orElse(null);
                if (first != null) {
                    first.put("active", true);
                    break;
                }
            }
        }
        JSArray list = new JSArray();
        for (JSObject o : byKey.values()) list.put(o);
        JSObject r = new JSObject();
        r.put("outputs", list);
        return r;
    }

    private Set<Integer> activeDeviceIds() {
        Set<Integer> ids = new HashSet<>();
        if (Build.VERSION.SDK_INT >= 33) {
            AudioAttributes media = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
            List<AudioDeviceInfo> routed = audio.getAudioDevicesForAttributes(media);
            for (AudioDeviceInfo d : routed) ids.add(d.getId());
        }
        return ids;
    }

    /** Tipos que tocam música. Fica de fora o que é de chamada (fone do ouvido, SCO) ou interno. */
    private static String kindOf(int type) {
        switch (type) {
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
                return "speaker";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
            case AudioDeviceInfo.TYPE_LINE_ANALOG:
            case AudioDeviceInfo.TYPE_LINE_DIGITAL:
            case AudioDeviceInfo.TYPE_AUX_LINE:
                return "wired";
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
            case AudioDeviceInfo.TYPE_BLE_HEADSET:
            case AudioDeviceInfo.TYPE_BLE_SPEAKER:
            case AudioDeviceInfo.TYPE_BLE_BROADCAST:
                return "bluetooth";
            case AudioDeviceInfo.TYPE_USB_DEVICE:
            case AudioDeviceInfo.TYPE_USB_HEADSET:
            case AudioDeviceInfo.TYPE_USB_ACCESSORY:
                return "usb";
            case AudioDeviceInfo.TYPE_HDMI:
            case AudioDeviceInfo.TYPE_HDMI_ARC:
            case AudioDeviceInfo.TYPE_HDMI_EARC:
                return "hdmi";
            case AudioDeviceInfo.TYPE_DOCK:
            case AudioDeviceInfo.TYPE_DOCK_ANALOG:
                return "other";
            default:
                return null;
        }
    }

    private static String defaultName(String kind) {
        switch (kind) {
            case "wired":
                return "Fone com fio";
            case "bluetooth":
                return "Bluetooth";
            case "usb":
                return "USB";
            case "hdmi":
                return "HDMI";
            default:
                return "Saída de áudio";
        }
    }
}
