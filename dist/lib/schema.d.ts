import * as bedrock from "@joelek/bedrock";
import { Database, DatabaseManager } from "./database";
import { File } from "./files";
import { Links, LinkManagersFromLinks } from "./link";
import { Stores, StoreManagersFromStores } from "./store";
export declare const BinaryFieldSchema: bedrock.codecs.ObjectCodec<{
    type: "BinaryField";
    defaultValue: Uint8Array;
}>;
export declare type BinaryFieldSchema = ReturnType<typeof BinaryFieldSchema["decode"]>;
export declare const BooleanFieldSchema: bedrock.codecs.ObjectCodec<{
    type: "BooleanField";
    defaultValue: boolean;
}>;
export declare type BooleanFieldSchema = ReturnType<typeof BooleanFieldSchema["decode"]>;
export declare const StringFieldSchema: bedrock.codecs.ObjectCodec<{
    type: "StringField";
    defaultValue: string;
}>;
export declare type StringFieldSchema = ReturnType<typeof StringFieldSchema["decode"]>;
export declare const NullableStringFieldSchema: bedrock.codecs.ObjectCodec<{
    type: "NullableStringField";
    defaultValue: string | null;
}>;
export declare type NullableStringFieldSchema = ReturnType<typeof NullableStringFieldSchema["decode"]>;
export declare const FieldSchema: bedrock.codecs.UnionCodec<[{
    type: "BinaryField";
    defaultValue: Uint8Array;
}, {
    type: "BooleanField";
    defaultValue: boolean;
}, {
    type: "StringField";
    defaultValue: string;
}, {
    type: "NullableStringField";
    defaultValue: string | null;
}]>;
export declare type FieldSchema = ReturnType<typeof FieldSchema["decode"]>;
export declare const FieldsSchema: bedrock.codecs.RecordCodec<{
    type: "BinaryField";
    defaultValue: Uint8Array;
} | {
    type: "BooleanField";
    defaultValue: boolean;
} | {
    type: "StringField";
    defaultValue: string;
} | {
    type: "NullableStringField";
    defaultValue: string | null;
}>;
export declare type FieldsSchema = ReturnType<typeof FieldsSchema["decode"]>;
export declare const KeysSchema: bedrock.codecs.ArrayCodec<string>;
export declare type KeysSchema = ReturnType<typeof KeysSchema["decode"]>;
export declare const IndexSchema: bedrock.codecs.ObjectCodec<{
    keys: string[];
    bid: number;
}>;
export declare type IndexSchema = ReturnType<typeof IndexSchema["decode"]>;
export declare const IndicesSchema: bedrock.codecs.ArrayCodec<{
    keys: string[];
    bid: number;
}>;
export declare type IndicesSchema = ReturnType<typeof IndicesSchema["decode"]>;
export declare const StoreSchema: bedrock.codecs.ObjectCodec<{
    version: number;
    fields: globalThis.Record<string, {
        type: any;
        defaultValue: any;
    } | {
        type: any;
        defaultValue: any;
    } | {
        type: any;
        defaultValue: any;
    } | {
        type: any;
        defaultValue: any;
    }>;
    keys: string[];
    indices: {
        keys: any;
        bid: any;
    }[];
    storageBid: number;
}>;
export declare type StoreSchema = ReturnType<typeof StoreSchema["decode"]>;
export declare const StoresSchema: bedrock.codecs.RecordCodec<{
    version: number;
    fields: globalThis.Record<string, {
        type: any;
        defaultValue: any;
    } | {
        type: any;
        defaultValue: any;
    } | {
        type: any;
        defaultValue: any;
    } | {
        type: any;
        defaultValue: any;
    }>;
    keys: string[];
    indices: {
        keys: any;
        bid: any;
    }[];
    storageBid: number;
}>;
export declare type StoresSchema = ReturnType<typeof StoresSchema["decode"]>;
export declare const DecreasingOrderSchema: bedrock.codecs.ObjectCodec<{
    type: "DecreasingOrder";
}>;
export declare type DecreasingOrderSchema = ReturnType<typeof DecreasingOrderSchema["decode"]>;
export declare const IncreasingOrderSchema: bedrock.codecs.ObjectCodec<{
    type: "IncreasingOrder";
}>;
export declare type IncreasingOrderSchema = ReturnType<typeof IncreasingOrderSchema["decode"]>;
export declare const OrderSchema: bedrock.codecs.UnionCodec<[{
    type: "DecreasingOrder";
}, {
    type: "IncreasingOrder";
}]>;
export declare type OrderSchema = ReturnType<typeof OrderSchema["decode"]>;
export declare const KeyOrderSchema: bedrock.codecs.ObjectCodec<{
    key: string;
    order: {
        type: any;
    } | {
        type: any;
    };
}>;
export declare type KeyOrderSchema = ReturnType<typeof KeyOrderSchema["decode"]>;
export declare const KeyOrdersSchema: bedrock.codecs.ArrayCodec<{
    key: string;
    order: {
        type: any;
    } | {
        type: any;
    };
}>;
export declare type KeyOrdersSchema = ReturnType<typeof KeyOrdersSchema["decode"]>;
export declare const KeysMapSchema: bedrock.codecs.RecordCodec<string>;
export declare type KeyMapSchema = ReturnType<typeof KeysMapSchema["decode"]>;
export declare const LinkSchema: bedrock.codecs.ObjectCodec<{
    version: number;
    parent: string;
    child: string;
    keysMap: globalThis.Record<string, string>;
    orders: {
        key: any;
        order: any;
    }[];
}>;
export declare type LinkSchema = ReturnType<typeof LinkSchema["decode"]>;
export declare const LinksSchema: bedrock.codecs.RecordCodec<{
    version: number;
    parent: string;
    child: string;
    keysMap: globalThis.Record<string, string>;
    orders: {
        key: any;
        order: any;
    }[];
}>;
export declare type LinksSchema = ReturnType<typeof LinksSchema["decode"]>;
export declare const DatabaseSchema: bedrock.codecs.ObjectCodec<{
    stores: globalThis.Record<string, {
        version: any;
        fields: any;
        keys: any;
        indices: any;
        storageBid: any;
    }>;
    links: globalThis.Record<string, {
        version: any;
        parent: any;
        child: any;
        keysMap: any;
        orders: any;
    }>;
}>;
export declare type DatabaseSchema = ReturnType<typeof DatabaseSchema["decode"]>;
export declare function isSchemaCompatible<V>(codec: bedrock.codecs.Codec<V>, subject: any): subject is V;
export declare class SchemaManager {
    private getStoreName;
    private initializeDatabase;
    private loadFieldManager;
    private loadOrderManager;
    private loadStoreManager;
    private loadLinkManager;
    private loadDatabaseManager;
    private compareField;
    private compareFields;
    private compareKeys;
    private compareIndex;
    private compareStore;
    private compareLink;
    private createField;
    private createStore;
    private deleteStore;
    private updateStore;
    private updateStores;
    private createOrder;
    private createKeyOrders;
    private createLink;
    private deleteLink;
    private updateLink;
    private updateLinks;
    private updateDatabase;
    private getDirtyStoreNames;
    private getDirtyLinkNames;
    constructor();
    createDatabaseManager<A extends Stores<any>, B extends Links<any>>(file: File, database: Database<A, B>): DatabaseManager<StoreManagersFromStores<A>, LinkManagersFromLinks<B>>;
}
