import * as bedrock from "@joelek/bedrock";

export type Value = Uint8Array | bigint | boolean | null | number | string;
export type Record = { [key: string]: Value; };
export type Key<A> = keyof A & string;
export type Keys<A> = Array<Key<A>>;
export type RequiredKey<A> = Key<A> & {
	[B in keyof A]: null extends A[B] ? never : B;
}[keyof A];
export type RequiredKeys<A> = Array<RequiredKey<A>>;
export type KeysRecord<A extends Record, B extends Keys<A>> = A | Pick<A, B[number]>;
export type KeysRecordMap<A extends Record, B extends Keys<A>, C extends Record> = {
	[D in B[number]]: {
		[E in keyof C]: A[D] extends C[E] ? E : never;
	}[keyof C];
};

export abstract class Field<A extends Value> {
	protected codec: bedrock.codecs.Codec<A>;
	protected defaultValue: A;
	protected searchable?: boolean;

	constructor(codec: bedrock.codecs.Codec<A>, defaultValue: A, searchable?: boolean) {
		this.codec = codec;
		this.defaultValue = defaultValue;
		this.searchable = searchable;
	}

	getCodec(): bedrock.codecs.Codec<A> {
		return this.codec;
	}

	getDefaultValue(): A {
		return this.defaultValue;
	}

	getSearchable(): boolean | undefined {
		return this.searchable;
	}
};

export type Fields<A extends Record> = {
	[B in keyof A]: Field<A[B]>;
};

export class BigIntField extends Field<bigint> {
	constructor(defaultValue: bigint) {
		super(bedrock.codecs.BigInt, defaultValue);
	}
};

export class NullableBigIntField extends Field<bigint | null> {
	constructor(defaultValue: bigint | null) {
		super(bedrock.codecs.Union.of(
			bedrock.codecs.BigInt,
			bedrock.codecs.Null
		), defaultValue);
	}
};

export class BinaryField extends Field<Uint8Array> {
	constructor(defaultValue: Uint8Array) {
		super(bedrock.codecs.Binary, defaultValue);
	}
};

export class NullableBinaryField extends Field<Uint8Array | null> {
	constructor(defaultValue: Uint8Array | null) {
		super(bedrock.codecs.Union.of(
			bedrock.codecs.Binary,
			bedrock.codecs.Null
		), defaultValue);
	}
};

export class BooleanField extends Field<boolean> {
	constructor(defaultValue: boolean) {
		super(bedrock.codecs.Boolean, defaultValue);
	}
};

export class NullableBooleanField extends Field<boolean | null> {
	constructor(defaultValue: boolean | null) {
		super(bedrock.codecs.Union.of(
			bedrock.codecs.Boolean,
			bedrock.codecs.Null
		), defaultValue);
	}
};

export class IntegerField extends Field<number> {
	constructor(defaultValue: number) {
		super(bedrock.codecs.Integer, defaultValue);
	}
};

export class NullableIntegerField extends Field<number | null> {
	constructor(defaultValue: number | null) {
		super(bedrock.codecs.Union.of(
			bedrock.codecs.Integer,
			bedrock.codecs.Null
		), defaultValue);
	}
};

export class NumberField extends Field<number> {
	constructor(defaultValue: number) {
		super(bedrock.codecs.Number, defaultValue);
	}
};

export class NullableNumberField extends Field<number | null> {
	constructor(defaultValue: number | null) {
		super(bedrock.codecs.Union.of(
			bedrock.codecs.Number,
			bedrock.codecs.Null
		), defaultValue);
	}
};

export class StringField extends Field<string> {
	constructor(defaultValue: string, searchable?: boolean) {
		super(bedrock.codecs.String, defaultValue, searchable);
	}
};

export class NullableStringField extends Field<string | null> {
	constructor(defaultValue: string | null, searchable?: boolean) {
		super(bedrock.codecs.Union.of(
			bedrock.codecs.String,
			bedrock.codecs.Null
		), defaultValue, searchable);
	}
};

export class RecordManager<A extends Record> {
	private fields: Fields<A>;
	private tupleKeys: Keys<A>;
	private tupleCodec: bedrock.codecs.TupleCodec<Array<A[Key<A>]>>;

	constructor(fields: Fields<A>) {
		this.fields = fields;
		this.tupleKeys = Object.keys(fields).sort();
		this.tupleCodec = bedrock.codecs.Tuple.of(...this.tupleKeys.map((key) => fields[key].getCodec()));
	}

	decode(buffer: Uint8Array): A {
		let values = this.tupleCodec.decode(buffer, "record");
		let record = {} as A;
		for (let [index, key] of this.tupleKeys.entries()) {
			record[key] = values[index];
		}
		return record;
	}

	encode(record: A): Uint8Array {
		let values = this.tupleKeys.map((key) => record[key]);
		let buffer = this.tupleCodec.encode(values, "record");
		return buffer;
	}

	decodeKeys<B extends Keys<A>>(keys: [...B], buffers: Array<Uint8Array>): Pick<A, B[number]> {
		let record = {} as Pick<A, B[number]>;
		for (let [index, key] of keys.entries()) {
			record[key] = this.fields[key].getCodec().decodePayload(buffers[index]);
		}
		return record;
	}

	encodeKeys<B extends Keys<A>>(keys: [...B], record: Pick<A, B[number]>): Array<Uint8Array> {
		let buffers = keys.map((key) => this.fields[key].getCodec().encodePayload(record[key]));
		return buffers;
	}
};
