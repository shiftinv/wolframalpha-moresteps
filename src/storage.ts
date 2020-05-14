type Option = { text: string, default: boolean, description?: string };
type OptionName = keyof typeof ExtStorage.options;
// workaround for object literal key type inference
let asOptions = <T>(o: { [K in keyof T]: Option }) => o;

class ExtStorage {
    private static readonly storage = browser.storage.sync;
    private static readonly STORAGE_APPID_KEY = 'appid';
    private static readonly STORAGE_OPTIONS_KEY_PREFIX = '__option-';

    static options = asOptions({
        'consolidate': {
            text: 'Consolidate requests',
            default: false,
            description: 'Accumulates subqueries for 500ms and sends them as one request.\nThis can significantly reduce the number of API calls if a result page contains multiple step-by-step blocks\n(in exchange for slightly longer step-by-step loading delays).'
        }
    });

    static async getAppID(): Promise<string | undefined> {
        return this.storage.get(this.STORAGE_APPID_KEY)
            .then(data => data[this.STORAGE_APPID_KEY] as string | undefined);
    }

    static async setAppID(id: string | undefined): Promise<void> {
        return this.storage.set({
            [this.STORAGE_APPID_KEY]: id
        });
    }

    static async getOption(name: OptionName): Promise<boolean> {
        const key = `${this.STORAGE_OPTIONS_KEY_PREFIX}${name}`;
        return this.storage.get(key)
            .then(data => data[key] as boolean ?? this.options[name].default);
    }

    static async setOption(name: string, value: boolean): Promise<void> {
        const key = `${this.STORAGE_OPTIONS_KEY_PREFIX}${name}`;
        return this.storage.set({
            [key]: value as any
        });
    }
}

asOptions = undefined as any;

