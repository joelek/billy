import { EqualityFilter, FilterMap } from "./filters";
import { OrderMap } from "./orders";
import { Key, Keys, KeysRecord, KeysRecordMap, Record, RequiredKeys } from "./records";
import { Index, Store, StoreManager } from "./stores";

export interface ReadableLink<A extends Record, B extends RequiredKeys<A>, C extends Record, D extends RequiredKeys<C>, E extends KeysRecordMap<A, B, C>> {
	filter(keysRecord?: KeysRecord<A, B>, anchor?: KeysRecord<C, D>): Promise<Array<C>>;
	lookup(record: C | Pick<C, E[B[number]]>): Promise<A | undefined>;
};

export type ReadableLinks<A> = {
	[B in keyof A]: A[B] extends ReadableLink<infer C, infer D, infer E, infer F, infer G> ? ReadableLink<C, D, E, F, G> : A[B];
};

export type ReadableLinksFromLinks<A extends Links<any>> = {
	[B in keyof A]: A[B] extends Link<infer C, infer D, infer E, infer F, infer G> ? ReadableLink<C, D, E, F, G> : never;
};

export type LinksFromReadableLinks<A extends ReadableLinks<any>> = {
	[B in keyof A]: A[B] extends ReadableLink<infer C, infer D, infer E, infer F, infer G> ? Link<C, D, E, F, G> : never;
};

export interface WritableLink<A extends Record, B extends RequiredKeys<A>, C extends Record, D extends RequiredKeys<C>, E extends KeysRecordMap<A, B, C>> extends ReadableLink<A, B, C, D, E> {

};

export type WritableLinks<A> = {
	[B in keyof A]: A[B] extends WritableLink<infer C, infer D, infer E, infer F, infer G> ? WritableLink<C, D, E, F, G> : A[B];
};

export type WritableLinksFromLinks<A extends Links<any>> = {
	[B in keyof A]: A[B] extends Link<infer C, infer D, infer E, infer F, infer G> ? WritableLink<C, D, E, F, G> : never;
};

export type LinksFromWritableLinks<A extends WritableLinks<any>> = {
	[B in keyof A]: A[B] extends WritableLink<infer C, infer D, infer E, infer F, infer G> ? Link<C, D, E, F, G> : never;
};

export class WritableLinkManager<A extends Record, B extends RequiredKeys<A>, C extends Record, D extends RequiredKeys<C>, E extends KeysRecordMap<A, B, C>> implements WritableLink<A, B, C, D, E> {
	protected linkManager: LinkManager<A, B, C, D, E>;

	constructor(linkManager: LinkManager<A, B, C, D, E>) {
		this.linkManager = linkManager;
	}

	async filter(...parameters: Parameters<WritableLink<A, B, C, D, E>["filter"]>): ReturnType<WritableLink<A, B, C, D, E>["filter"]> {
		return this.linkManager.filter(...parameters);
	}

	async lookup(...parameters: Parameters<WritableLink<A, B, C, D, E>["lookup"]>): ReturnType<WritableLink<A, B, C, D, E>["lookup"]> {
		return this.linkManager.lookup(...parameters);
	}
};

export class LinkManager<A extends Record, B extends RequiredKeys<A>, C extends Record, D extends RequiredKeys<C>, E extends KeysRecordMap<A, B, C>> {
	private parent: StoreManager<A, B>;
	private child: StoreManager<C, D>;
	private keysRecordMap: E;
	private orders: OrderMap<C>;

	constructor(parent: StoreManager<A, B>, child: StoreManager<C, D>, keysRecordMap: E, orders?: OrderMap<C>) {
		this.parent = parent;
		this.child = child;
		this.keysRecordMap = keysRecordMap;
		this.orders = orders ?? {};
	}

	getParent(): StoreManager<A, B> {
		return this.parent;
	}

	getChild(): StoreManager<C, D> {
		return this.child;
	}

	filter(keysRecord?: KeysRecord<A, B>, anchor?: KeysRecord<C, D>, limit?: number): Array<C> {
		let filters = {} as FilterMap<C>;
		for (let key in this.keysRecordMap) {
			let keyOne = key as any as B[number];
			let keyTwo = this.keysRecordMap[keyOne];
			filters[keyTwo] = new EqualityFilter(keysRecord?.[keyOne] ?? null) as any;
		}
		return this.child.filter(filters, this.orders, anchor, limit);
	}

	lookup(record: C | Pick<C, E[B[number]]>): A | undefined {
		let keysRecord = {} as KeysRecord<A, B>;
		for (let key in this.keysRecordMap) {
			let keyOne = key as any as B[number];
			let keyTwo = this.keysRecordMap[keyOne];
			if (record[keyTwo] === null) {
				return;
			}
			keysRecord[keyOne] = record[keyTwo] as any;
		}
		return this.parent.lookup(keysRecord);
	}

	static construct<A extends Record, B extends RequiredKeys<A>, C extends Record, D extends RequiredKeys<C>, E extends KeysRecordMap<A, B, C>>(parent: StoreManager<A, B>, child: StoreManager<C, D>, recordKeysMap: E, orders?: OrderMap<C>): LinkManager<A, B, C, D, E> {
		return new LinkManager(parent, child, recordKeysMap, orders);
	}
};

export type LinkManagers<A> = {
	[B in keyof A]: A[B] extends LinkManager<infer C, infer D, infer E, infer F, infer G> ? LinkManager<C, D, E, F, G> : A[B];
};

export type LinkManagersFromLinks<A extends Links<any>> = {
	[B in keyof A]: A[B] extends Link<infer C, infer D, infer E, infer F, infer G> ? LinkManager<C, D, E, F, G> : never;
};

export type WritableLinksFromLinkManagers<A extends LinkManagers<any>> = {
	[B in keyof A]: A[B] extends LinkManager<infer C, infer D, infer E, infer F, infer G> ? WritableLink<C, D, E, F, G> : never;
};

export class Link<A extends Record, B extends RequiredKeys<A>, C extends Record, D extends RequiredKeys<C>, E extends KeysRecordMap<A, B, C>> {
	parent: Store<A, B>;
	child: Store<C, D>;
	recordKeysMap: E;
	orders: OrderMap<C>;

	constructor(parent: Store<A, B>, child: Store<C, D>, recordKeysMap: E, orders?: OrderMap<C>) {
		this.parent = parent;
		this.child = child;
		this.recordKeysMap = recordKeysMap;
		this.orders = orders ?? {};
		this.child.index(this.createIndex());
	}

	createIndex(): Index<C> {
		let keys = [] as Keys<C>;
		for (let key in this.recordKeysMap) {
			let thatKey = this.recordKeysMap[key] as Key<C>;
			if (!keys.includes(thatKey)) {
				keys.push(thatKey);
			}
		}
		for (let key in this.orders) {
			let order = this.orders[key];
			if (order == null) {
				continue;
			}
			if (!keys.includes(key)) {
				keys.push(key);
			}
		}
		for (let key of this.child.keys) {
			if (!keys.includes(key)) {
				keys.push(key);
			}
		}
		return new Index(keys);
	}
};

export type Links<A> = {
	[B in keyof A]: A[B] extends Link<infer C, infer D, infer E, infer F, infer G> ? Link<C, D, E, F, G> : A[B];
};

export class OverridableWritableLink<A extends Record, B extends RequiredKeys<A>, C extends Record, D extends RequiredKeys<C>, E extends KeysRecordMap<A, B, C>> implements WritableLink<A, B, C, D, E> {
	private linkManager: LinkManager<A, B, C, D, E>;
	private overrides: Partial<WritableLink<A, B, C, D, E>>;

	constructor(linkManager: LinkManager<A, B, C, D, E>, overrides: Partial<WritableLink<A, B, C, D, E>>) {
		this.linkManager = linkManager;
		this.overrides = overrides;
	}

	async filter(...parameters: Parameters<WritableLink<A, B, C, D, E>["filter"]>): ReturnType<WritableLink<A, B, C, D, E>["filter"]> {
		return this.overrides.filter?.(...parameters) ?? this.linkManager.filter(...parameters);
	}

	async lookup(...parameters: Parameters<WritableLink<A, B, C, D, E>["lookup"]>): ReturnType<WritableLink<A, B, C, D, E>["lookup"]> {
		return this.overrides.lookup?.(...parameters) ?? this.linkManager.lookup(...parameters);
	}
};
