import * as bedrock from "@joelek/bedrock";
import { File } from "./files";
import { Record, Keys } from "./records";
import { Link, LinkManager, LinkManagers, LinkReference, Links } from "./link";
import { Store, StoreManager, StoreManagers, StoreReference, Stores } from "./store";
import { PromiseQueue } from "./utils";
import { BlockHandler } from "./vfs";

export class ReadableStore<A extends Record, B extends Keys<A>> {
	protected storeManager: StoreManager<A, B>;
	protected queue: PromiseQueue;

	constructor(storeManager: StoreManager<A, B>, queue: PromiseQueue) {
		this.storeManager = storeManager;
		this.queue = queue;
	}

	filter(...parameters: Parameters<StoreManager<A, B>["filter"]>): Promise<ReturnType<StoreManager<A, B>["filter"]>> {
		return this.queue.enqueue(() => this.storeManager.filter(...parameters));
	}

	length(...parameters: Parameters<StoreManager<A, B>["length"]>): Promise<ReturnType<StoreManager<A, B>["length"]>> {
		return this.queue.enqueue(() => this.storeManager.length(...parameters));
	}

	lookup(...parameters: Parameters<StoreManager<A, B>["lookup"]>): Promise<ReturnType<StoreManager<A, B>["lookup"]>> {
		return this.queue.enqueue(() => this.storeManager.lookup(...parameters));
	}
};

export type ReadableStores<A> = {
	[B in keyof A]: A[B] extends Store<infer C, infer D> ? ReadableStore<C, D> : never;
};

export class WritableStore<A extends Record, B extends Keys<A>> extends ReadableStore<A, B> {
	constructor(storeManager: StoreManager<A, B>, queue: PromiseQueue) {
		super(storeManager, queue);
	}

	insert(...parameters: Parameters<StoreManager<A, B>["insert"]>): Promise<ReturnType<StoreManager<A, B>["insert"]>> {
		return this.queue.enqueue(() => this.storeManager.insert(...parameters));
	}

	remove(...parameters: Parameters<StoreManager<A, B>["remove"]>): Promise<ReturnType<StoreManager<A, B>["remove"]>> {
		return this.queue.enqueue(() => this.storeManager.remove(...parameters));
	}
};

export type WritableStores<A> = {
	[B in keyof A]: A[B] extends Store<infer C, infer D> ? WritableStore<C, D> : never;
};

export class ReadableLink<A extends Record, B extends Keys<A>, C extends Record, D extends Keys<C>> {
	protected linkManager: LinkManager<A, B, C, D>;
	protected queue: PromiseQueue;

	constructor(linkManager: LinkManager<A, B, C, D>, queue: PromiseQueue) {
		this.linkManager = linkManager;
		this.queue = queue;
	}

	filter(...parameters: Parameters<LinkManager<A, B, C, D>["filter"]>): Promise<ReturnType<LinkManager<A, B, C, D>["filter"]>> {
		return this.queue.enqueue(() => this.linkManager.filter(...parameters));
	}

	lookup(...parameters: Parameters<LinkManager<A, B, C, D>["lookup"]>): Promise<ReturnType<LinkManager<A, B, C, D>["lookup"]>> {
		return this.queue.enqueue(() => this.linkManager.lookup(...parameters));
	}
};

export type ReadableLinks<A> = {
	[B in keyof A]: A[B] extends Link<infer C, infer D, infer E, infer F> ? ReadableLink<C, D, E, F> : never;
};

export class WritableLink<A extends Record, B extends Keys<A>, C extends Record, D extends Keys<C>> extends ReadableLink<A, B, C, D> {
	constructor(linkManager: LinkManager<A, B, C, D>, queue: PromiseQueue) {
		super(linkManager, queue);
	}
};

export type WritableLinks<A> = {
	[B in keyof A]: A[B] extends Link<infer C, infer D, infer E, infer F> ? WritableLink<C, D, E, F> : never;
};

export const DatabaseSchema = bedrock.codecs.Object.of({
	storeBids: bedrock.codecs.Record.of(bedrock.codecs.Integer),
	linkBids: bedrock.codecs.Record.of(bedrock.codecs.Integer)
});

export type DatabaseSchema = ReturnType<typeof DatabaseSchema["decode"]>;

export type ReadableTransaction<A, B, C> = (stores: ReadableStores<A>, links: ReadableLinks<B>) => Promise<C>;

export type WritableTransaction<A, B, C> = (stores: WritableStores<A>, links: WritableLinks<B>) => Promise<C>;

export class DatabaseManager<A, B> {
	private blockHandler: BlockHandler;
	private bid: number;
	private file: File;
	private readableTransactionLock: Promise<any>;
	private writableTransactionLock: Promise<any>;
	private storeManagers: StoreManagers<A>;
	private linkManagers: LinkManagers<B>;

	private createReadableLinks(queue: PromiseQueue): ReadableLinks<B> {
		let links = {} as ReadableLinks<B>;
		for (let key in this.linkManagers) {
			let linkManager = this.linkManagers[key];
			let link = new ReadableLink(linkManager, queue);
			links[key] = link as any;
		}
		return links;
	}

	private createReadableStores(queue: PromiseQueue): ReadableStores<A> {
		let stores = {} as ReadableStores<A>;
		for (let key in this.storeManagers) {
			let storeManager = this.storeManagers[key];
			let store = new ReadableStore(storeManager, queue);
			stores[key] = store as any;
		}
		return stores;
	}

	private createWritableLinks(queue: PromiseQueue): WritableLinks<B> {
		let links = {} as WritableLinks<B>;
		for (let key in this.linkManagers) {
			let linkManager = this.linkManagers[key];
			let link = new ReadableLink(linkManager, queue);
			links[key] = link as any;
		}
		return links;
	}

	private createWritableStores(queue: PromiseQueue): WritableStores<A> {
		let stores = {} as WritableStores<A>;
		for (let key in this.storeManagers) {
			let storeManager = this.storeManagers[key];
			let store = new WritableStore(storeManager, queue); // TODO: Pass detail to writable
			stores[key] = store as any;
		}
		return stores;
	}

	private saveSchema(): void {
		let storeBids = {} as DatabaseSchema["storeBids"];
		for (let key in this.storeManagers) {
			storeBids[key] = this.storeManagers[key].getBid();
		}
		let linkBids = {} as DatabaseSchema["linkBids"];
		for (let key in this.linkManagers) {
			linkBids[key] = this.linkManagers[key].getBid();
		}
		let schema: DatabaseSchema = {
			storeBids,
			linkBids
		};
		let buffer = DatabaseSchema.encode(schema);
		this.blockHandler.resizeBlock(this.bid, buffer.length);
		this.blockHandler.writeBlock(this.bid, buffer);
	}

	private constructor(blockHandler: BlockHandler, bid: number, file: File, storeManagers: StoreManagers<A>, linkManagers: LinkManagers<B>) {
		this.blockHandler = blockHandler;
		this.bid = bid;
		this.file = file;
		this.readableTransactionLock = Promise.resolve();
		this.writableTransactionLock = Promise.resolve();
		this.storeManagers = storeManagers;
		this.linkManagers = linkManagers;
	}

	async enqueueReadableTransaction<C>(transaction: ReadableTransaction<A, B, C>): Promise<C> {
		let queue = new PromiseQueue();
		let stores = this.createReadableStores(queue);
		let links = this.createReadableLinks(queue);
		let promise = this.readableTransactionLock
			.then(() => transaction(stores, links))
			.then(() => queue.wait());
		this.writableTransactionLock = this.writableTransactionLock
			.then(() => promise)
			.catch(() => {});
		try {
			let value = await promise;
			return value;
		} catch (error) {
			throw error;
		}
	}

	async enqueueWritableTransaction<C>(transaction: WritableTransaction<A, B, C>): Promise<C> {
		let queue = new PromiseQueue();
		let stores = this.createWritableStores(queue);
		let links = this.createWritableLinks(queue);
		let promise = this.writableTransactionLock
			.then(() => transaction(stores, links))
			.then(() => queue.wait());
		this.writableTransactionLock = this.readableTransactionLock = this.writableTransactionLock
			.then(() => promise)
			.catch(() => {});
		try {
			let value = await promise;
			this.file.persist();
			return value;
		} catch (error) {
			this.file.discard();
			throw error;
		}
	}

	static migrate<A extends Stores<A>, B extends Links<B>>(oldDatabase: DatabaseManager<any, any>, options: {
		stores: A,
		links: B
	}): DatabaseManager<A, B> {
		let migratedStores = [] as Array<keyof A>;
		for (let key in options.stores) {
			if (oldDatabase.storeManagers[key] == null) {

			}
		}
		for (let key in oldDatabase.storeManagers) {
			if (options.stores[key as string as keyof A] == null) {
				// remove store
			}
		}
	}

	// TODO: Handle schema outside.
	static construct<A extends Stores<A>, B extends Links<B>>(blockHandler: BlockHandler, bid: number | null, file: File, options?: {
		stores: A,
		links: B
	}): DatabaseManager<A, B> {
		if (bid == null) {
			if (options == null) {
				return DatabaseManager.construct<any, any>(blockHandler, null, file, {
					stores: {},
					links: {}
				});
			} else {
				let storeManagers = {} as StoreManagers<A>;
				for (let key in options.stores) {
					storeManagers[key] = options.stores[key].createManager(blockHandler, null) as any;
				}
				let linkManagers = {} as LinkManagers<B>;
				for (let key in options.links) {
					linkManagers[key] = options.links[key].createManager(blockHandler, null) as any;
				}
				bid = blockHandler.createBlock(64);
				let manager = new DatabaseManager(blockHandler, bid, file, storeManagers, linkManagers);
				manager.saveSchema();
				return manager;
			}
		} else {
			if (options == null) {
				let schema = DatabaseSchema.decode(blockHandler.readBlock(bid));
				let storeManagers = {} as StoreManagers<A>;
				for (let key in schema.storeBids) {
					storeManagers[key as keyof A] = StoreManager.construct(blockHandler, schema.storeBids[key]) as any;
				}
				let linkManagers = {} as LinkManagers<B>;
				for (let key in schema.linkBids) {
					linkManagers[key as keyof A] = LinkManager.construct(blockHandler, schema.linkBids[key]) as any;
				}
				let manager = new DatabaseManager(blockHandler, bid, file, storeManagers, linkManagers);
				return manager;
			} else {
				return DatabaseManager.migrate(DatabaseManager.construct(blockHandler, bid, file), options);
			}
		}
	}
};
