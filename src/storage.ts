interface Option {
    text: string;
    default: boolean;
    description?: string;
    resetDays?: number;
}
type OptionName = keyof typeof ExtStorage.options;
// workaround for object literal key type inference
let asOptions = <T>(o: { [K in keyof T]: Option }) => o;

class ExtStorage {
    private static readonly storage = browser.storage.sync;
    private static readonly STORAGE_APPID_KEY = 'appid';
    private static readonly STORAGE_OPTIONS_KEY_PREFIX = '__option-';

    static readonly options = asOptions({
        'prefetch': {
            text: 'Prefetch step-by-step instructions',
            default: true,
            description: 'Fetches step-by-step instructions as soon as the first query results are received,\nnot just when each original step-by-step block is received, which reduces loading delays by 1-2s'
        },
        'consolidate': {
            text: 'Consolidate requests',
            default: true,
            description: '[requires \'prefetch\' option]\nAccumulates subqueries and sends them as one request.\nThis can significantly reduce the number of API calls if a result page contains multiple step-by-step blocks,\nin exchange for slightly longer step-by-step loading delays on such pages'
        },
        'consolidate+async': {
            text: 'Retrieve results asynchronously',
            default: false,
            description: '[requires \'consolidate\' option]\nRequests step-by-step instructions asynchronously, i.e. as soon as each one is ready instead of all at once.\nThis may marginally reduce some of the delay introduced by consolidation, and does not count towards API usage'
        },
        'includepodid': {
            text: 'Only request relevant results',
            default: true,
            description: 'Uses the \'includepodid\' parameter to only request data relevant to the current result type, instead of requesting everything. This significantly improves speed, sometimes by up to 80%.\nOccasionally the API is somewhat broken and doesn\'t return anything when that parameter is used, which is why this option exists',
            resetDays: 3
        },
        'increasetimeout': {
            text: 'Use larger timeout values for computations',
            default: true,
            description: 'Uses timeout values that are 2-3x larger than the defaults. This solves issues especially with more complicated/extensive queries, as the default timeout values used by the API are relatively low'
        },
        'misc-hidebanner': {
            text: 'Hide top banner by default',
            default: true,
            description: 'Automatically hides the top banner on the website'
        }
    });
    private static dependencies: { [key in OptionName]?: OptionName[] } = {
        'consolidate': ['prefetch'],
        'consolidate+async': ['consolidate']
    };

    private static getDependencies(name: OptionName): OptionName[] {
        const allDependencies: OptionName[] = [];
        function collectRecursive(currName: OptionName) {
            const deps = ExtStorage.dependencies[currName];
            if (!deps) return;
            for (const dependency of deps) {
                if (!allDependencies.includes(dependency) && dependency !== name) {
                    allDependencies.push(dependency);
                    collectRecursive(dependency);
                }
            }
        }
        collectRecursive(name);
        return allDependencies;
    }

    static async getAppID(): Promise<string | undefined> {
        return this.storage.get(this.STORAGE_APPID_KEY)
            .then(data => data[this.STORAGE_APPID_KEY] as string | undefined);
    }

    static async setAppID(id: string | undefined): Promise<void> {
        return this.storage.set({
            [this.STORAGE_APPID_KEY]: id
        });
    }

    static async isAvailable(name: OptionName): Promise<boolean> {
        const dependencyKeys = this.getDependencies(name).map(k => `${this.STORAGE_OPTIONS_KEY_PREFIX}${k}`);
        return this.storage.get(dependencyKeys)
            .then(data => Object.values(data).every(value => value !== false));
    }

    static async getOption(name: OptionName): Promise<boolean> {
        const available = await this.isAvailable(name);
        if (!available) return false;

        const key = `${this.STORAGE_OPTIONS_KEY_PREFIX}${name}`;
        return await this.storage.get(key)
            .then(data => data[key] as boolean ?? this.options[name].default);
    }

    static async setOption(name: OptionName, value: boolean): Promise<void> {
        const key = `${this.STORAGE_OPTIONS_KEY_PREFIX}${name}`;
        const changeTimeKey = `${this.STORAGE_OPTIONS_KEY_PREFIX}${name}__changeTime`;
        return this.storage.set({
            [key]: value as any,
            [changeTimeKey]: Date.now()
        });
    }

    static async checkResets(): Promise<void> {
        const resetOptions = (Object.entries(this.options) as [OptionName, Option][])
            .filter(([name, meta]) => meta.resetDays !== undefined);
        const now = Date.now();
        for (const [name, meta] of resetOptions) {
            const changeTimeKey = `${this.STORAGE_OPTIONS_KEY_PREFIX}${name}__changeTime`;
            const changeTime = (await this.storage.get(changeTimeKey))[changeTimeKey] as
                number | undefined;
            if (!changeTime) continue;

            const diff = Math.floor((now - changeTime) / (24 * 60 * 60 * 1000));
            if (diff >= meta.resetDays!) {
                console.log(`Resetting option \'${name}\' to default value \'${meta.default}\'`);
                await this.setOption(name, meta.default);
            }
        }
    }
}

asOptions = undefined as any;

