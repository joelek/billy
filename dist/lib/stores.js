"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverridableWritableStore = exports.Store = exports.SearchIndex = exports.Index = exports.StoreManager = exports.SearchIndexManagerV2 = exports.SearchIndexManagerV1 = exports.getFirstCompletion = exports.IndexManager = exports.FilteredStore = exports.WritableStoreManager = void 0;
const bedrock = require("@joelek/bedrock");
const streams_1 = require("./streams");
const filters_1 = require("./filters");
const tables_1 = require("./tables");
const orders_1 = require("./orders");
const records_1 = require("./records");
const trees_1 = require("./trees");
const sorters_1 = require("../mod/sorters");
const utils_1 = require("./utils");
;
class WritableStoreManager {
    storeManager;
    constructor(storeManager) {
        this.storeManager = storeManager;
    }
    async filter(...parameters) {
        return this.storeManager.filter(...parameters);
    }
    async insert(...parameters) {
        return this.storeManager.insert(...parameters);
    }
    async length(...parameters) {
        return this.storeManager.length(...parameters);
    }
    async lookup(...parameters) {
        return this.storeManager.lookup(...parameters);
    }
    async remove(...parameters) {
        return this.storeManager.remove(...parameters);
    }
    async search(...parameters) {
        return this.storeManager.search(...parameters).map((entry) => entry.record);
    }
    async update(...parameters) {
        return this.storeManager.update(...parameters);
    }
    async vacate(...parameters) {
        return this.storeManager.vacate(...parameters);
    }
}
exports.WritableStoreManager = WritableStoreManager;
;
class FilteredStore {
    recordManager;
    blockManager;
    bids;
    filters;
    orders;
    anchor;
    constructor(recordManager, blockManager, bids, filters, orders, anchor) {
        this.recordManager = recordManager;
        this.blockManager = blockManager;
        this.bids = bids;
        this.filters = filters ?? {};
        this.orders = orders ?? {};
        this.anchor = anchor;
    }
    *[Symbol.iterator]() {
        let iterable = streams_1.StreamIterable.of(this.bids)
            .map((bid) => {
            let buffer = this.blockManager.readBlock(bid);
            let record = this.recordManager.decode(buffer);
            return record;
        })
            .filter((record) => {
            for (let key in this.filters) {
                let filter = this.filters[key];
                if (filter == null) {
                    continue;
                }
                let value = record[key];
                if (!filter.matches(value)) {
                    return false;
                }
            }
            return true;
        });
        if (Object.keys(this.orders).length > 0) {
            iterable = iterable.sort((one, two) => {
                for (let key in this.orders) {
                    let order = this.orders[key];
                    if (order == null) {
                        continue;
                    }
                    let comparison = order.compare(one[key], two[key]);
                    if (comparison !== 0) {
                        return comparison;
                    }
                }
                return 0;
            });
        }
        if (this.anchor != null) {
            let encodedAnchor = this.recordManager.encode(this.anchor);
            let found = false;
            iterable = iterable.filter((record) => {
                if (!found) {
                    let encodedRecord = this.recordManager.encode(record);
                    if ((0, tables_1.compareBuffers)([encodedAnchor], [encodedRecord]) === 0) {
                        found = true;
                        return false;
                    }
                }
                return found;
            });
        }
        yield* iterable;
    }
    static getOptimal(filteredStores) {
        filteredStores.sort(sorters_1.CompositeSorter.of(sorters_1.NumberSorter.decreasing((value) => Object.keys(value.orders).length), sorters_1.NumberSorter.decreasing((value) => Object.keys(value.filters).length)));
        return filteredStores.pop();
    }
}
exports.FilteredStore = FilteredStore;
;
class IndexManager {
    recordManager;
    blockManager;
    keys;
    tree;
    constructor(recordManager, blockManager, keys, options) {
        this.recordManager = recordManager;
        this.blockManager = blockManager;
        this.keys = keys;
        this.tree = new trees_1.RadixTree(blockManager, options?.bid);
    }
    *[Symbol.iterator]() {
        yield* new FilteredStore(this.recordManager, this.blockManager, this.tree, {}, {});
    }
    delete() {
        this.tree.delete();
    }
    filter(filters, orders, anchor) {
        filters = filters ?? {};
        orders = orders ?? {};
        filters = { ...filters };
        orders = { ...orders };
        let keysConsumed = [];
        let keysRemaining = [...this.keys];
        let tree = this.tree;
        for (let indexKey of this.keys) {
            let filter = filters[indexKey];
            if (filter == null) {
                break;
            }
            if (filter instanceof filters_1.EqualityFilter) {
                let encodedValue = filter.getEncodedValue();
                let branch = tree.branch([encodedValue]);
                if (branch == null) {
                    return;
                }
                delete filters[indexKey];
                delete orders[indexKey];
                keysConsumed.push(keysRemaining.shift());
                tree = branch;
            }
        }
        let directions = [];
        let orderKeys = Object.keys(orders);
        for (let i = 0; i < orderKeys.length; i++) {
            if (keysRemaining[i] !== orderKeys[i]) {
                break;
            }
            let order = orders[orderKeys[i]];
            if (order == null) {
                break;
            }
            directions.push(order.getDirection());
            delete orders[orderKeys[i]];
        }
        let relationship = "^=";
        let keys = [];
        if (anchor != null) {
            relationship = ">";
            keys = this.recordManager.encodeKeys(keysRemaining, anchor);
        }
        let iterable = tree.filter(relationship, keys, directions);
        return new FilteredStore(this.recordManager, this.blockManager, iterable, filters, orders);
    }
    insert(keysRecord, bid) {
        let keys = this.recordManager.encodeKeys(this.keys, keysRecord);
        this.tree.insert(keys, bid);
    }
    remove(keysRecord) {
        let keys = this.recordManager.encodeKeys(this.keys, keysRecord);
        this.tree.remove(keys);
    }
    update(oldKeysRecord, newKeysRecord, bid) {
        let oldKeys = this.recordManager.encodeKeys(this.keys, oldKeysRecord);
        let newKeys = this.recordManager.encodeKeys(this.keys, newKeysRecord);
        if ((0, tables_1.compareBuffers)(oldKeys, newKeys) === 0) {
            return;
        }
        this.tree.remove(oldKeys);
        this.tree.insert(newKeys, bid);
    }
    vacate() {
        this.tree.vacate();
    }
}
exports.IndexManager = IndexManager;
;
function getFirstCompletion(prefix, tokens) {
    return tokens
        .filter((token) => token.startsWith(prefix))
        .map((token) => bedrock.codecs.String.encodePayload(token))
        .sort(bedrock.utils.Chunk.comparePrefixes)
        .map((buffer) => bedrock.codecs.String.decodePayload(buffer))
        .shift();
}
exports.getFirstCompletion = getFirstCompletion;
;
class SearchIndexManagerV1 {
    recordManager;
    blockManager;
    key;
    tree;
    computeRank(recordTokens, queryTokens) {
        return queryTokens.length - recordTokens.length;
    }
    computeRecordRank(record, query) {
        let recordTokens = this.tokenizeRecord(record);
        let queryTokens = utils_1.Tokenizer.tokenize(query);
        let lastQueryToken = queryTokens.pop() ?? "";
        for (let queryToken of queryTokens) {
            if (recordTokens.find((recordToken) => recordToken === queryToken) == null) {
                return;
            }
        }
        if (recordTokens.find((recordToken) => recordToken.startsWith(lastQueryToken)) == null) {
            return;
        }
        return this.computeRank(recordTokens, [...queryTokens, lastQueryToken]);
    }
    getNextPrefixMatch(prefix, relationship, previousResult) {
        let keys = [
            bedrock.codecs.Integer.encodePayload(1),
            bedrock.codecs.String.encodePayload(prefix)
        ];
        if (previousResult != null) {
            // Prefix tokens need to be completed in order to correctly locate the previous entry in the tree.
            let firstCompletion = getFirstCompletion(prefix, previousResult.tokens);
            if (firstCompletion == null) {
                keys = [
                    bedrock.codecs.Integer.encodePayload(previousResult.tokens.length + 1),
                    bedrock.codecs.String.encodePayload(prefix)
                ];
            }
            else {
                keys = [
                    bedrock.codecs.Integer.encodePayload(previousResult.tokens.length),
                    bedrock.codecs.String.encodePayload(firstCompletion),
                    bedrock.codecs.Integer.encodePayload(previousResult.bid)
                ];
            }
        }
        let bids = this.tree.filter(relationship, keys);
        outer: while (true) {
            inner: for (let bid of bids) {
                let record = this.readRecord(bid);
                let tokens = this.tokenizeRecord(record);
                // False matches will eventually be produced when traversing the tree.
                let firstCompletion = getFirstCompletion(prefix, tokens);
                if (firstCompletion == null) {
                    keys = [
                        bedrock.codecs.Integer.encodePayload(tokens.length + 1),
                        bedrock.codecs.String.encodePayload(prefix)
                    ];
                    bids = this.tree.filter(relationship, keys);
                    continue outer;
                }
                let recordKeys = [
                    bedrock.codecs.Integer.encodePayload(tokens.length),
                    bedrock.codecs.String.encodePayload(firstCompletion),
                    bedrock.codecs.Integer.encodePayload(bid)
                ];
                let comparison = (0, tables_1.compareBuffers)(recordKeys, keys);
                // Prefix tokens may produce duplicate matches when traversing the tree.
                if ((relationship === ">" && comparison <= 0) || (relationship === ">=" && comparison < 0)) {
                    continue inner;
                }
                let rank = 1;
                return {
                    bid,
                    record,
                    tokens,
                    rank
                };
            }
            break;
        }
    }
    getNextTokenMatch(token, relationship, previousResult) {
        let keys = [];
        if (previousResult != null) {
            keys = [
                bedrock.codecs.Integer.encodePayload(previousResult.tokens.length),
                bedrock.codecs.String.encodePayload(token),
                bedrock.codecs.Integer.encodePayload(previousResult.bid)
            ];
        }
        else {
            keys = [
                bedrock.codecs.Integer.encodePayload(1),
                bedrock.codecs.String.encodePayload(token)
            ];
        }
        let bids = this.tree.filter(relationship, keys);
        outer: while (true) {
            inner: for (let bid of bids) {
                let record = this.readRecord(bid);
                let tokens = this.tokenizeRecord(record);
                // False matches will eventually be produced when traversing the tree.
                if (!tokens.includes(token)) {
                    keys = [
                        bedrock.codecs.Integer.encodePayload(tokens.length + 1),
                        bedrock.codecs.String.encodePayload(token)
                    ];
                    bids = this.tree.filter(relationship, keys);
                    continue outer;
                }
                if (relationship === ">" && bid === previousResult?.bid) {
                    continue inner;
                }
                let rank = 1;
                return {
                    bid,
                    record,
                    tokens,
                    rank
                };
            }
            break;
        }
    }
    insertToken(token, category, bid) {
        this.tree.insert([
            bedrock.codecs.Integer.encodePayload(category),
            bedrock.codecs.String.encodePayload(token),
            bedrock.codecs.Integer.encodePayload(bid)
        ], bid);
    }
    removeToken(token, category, bid) {
        this.tree.remove([
            bedrock.codecs.Integer.encodePayload(category),
            bedrock.codecs.String.encodePayload(token),
            bedrock.codecs.Integer.encodePayload(bid)
        ]);
    }
    readRecord(bid) {
        let buffer = this.blockManager.readBlock(bid);
        let record = this.recordManager.decode(buffer);
        return record;
    }
    tokenizeRecord(record) {
        let value = record[this.key];
        if (typeof value === "string") {
            return utils_1.Tokenizer.tokenize(value);
        }
        return [];
    }
    constructor(recordManager, blockManager, key, options) {
        this.recordManager = recordManager;
        this.blockManager = blockManager;
        this.key = key;
        this.tree = new trees_1.RadixTree(blockManager, options?.bid);
    }
    *[Symbol.iterator]() {
        yield* streams_1.StreamIterable.of(this.search(""));
    }
    delete() {
        this.tree.delete();
    }
    insert(record, bid) {
        let tokens = this.tokenizeRecord(record);
        for (let token of tokens) {
            this.insertToken(token, tokens.length, bid);
        }
    }
    remove(record, bid) {
        let tokens = this.tokenizeRecord(record);
        for (let token of tokens) {
            this.removeToken(token, tokens.length, bid);
        }
    }
    *search(query, bid) {
        let previousResult;
        if (bid != null) {
            let record = this.readRecord(bid);
            let tokens = this.tokenizeRecord(record);
            let rank = 0;
            previousResult = {
                bid,
                record,
                tokens,
                rank
            };
        }
        let queryTokens = utils_1.Tokenizer.tokenize(query);
        let lastQueryToken = queryTokens.pop() ?? "";
        if (queryTokens.length === 0) {
            while (true) {
                let prefixCandidate = this.getNextPrefixMatch(lastQueryToken, ">", previousResult);
                if (prefixCandidate == null) {
                    return;
                }
                yield prefixCandidate;
                previousResult = prefixCandidate;
            }
        }
        else {
            let relationship = bid != null ? ">" : ">=";
            while (true) {
                let tokenCandidates = [];
                for (let queryToken of queryTokens) {
                    let nextTokenResult = this.getNextTokenMatch(queryToken, relationship, previousResult);
                    if (nextTokenResult == null) {
                        return;
                    }
                    tokenCandidates.push(nextTokenResult);
                }
                tokenCandidates = tokenCandidates.sort(sorters_1.CompositeSorter.of(sorters_1.NumberSorter.increasing((entry) => entry.tokens.length), sorters_1.NumberSorter.increasing((entry) => entry.bid)));
                let minimumTokenCandidate = tokenCandidates[0];
                let maximumTokenCandidate = tokenCandidates[tokenCandidates.length - 1];
                previousResult = maximumTokenCandidate;
                if (minimumTokenCandidate.bid === maximumTokenCandidate.bid) {
                    let prefixCandidate = this.getNextPrefixMatch(lastQueryToken, ">=", maximumTokenCandidate);
                    if (prefixCandidate == null) {
                        return;
                    }
                    if (prefixCandidate.bid === maximumTokenCandidate.bid) {
                        let { bid, record, tokens } = { ...maximumTokenCandidate };
                        let rank = this.computeRank(tokens, [...queryTokens, lastQueryToken]);
                        yield {
                            bid,
                            record,
                            tokens,
                            rank
                        };
                    }
                    relationship = ">";
                }
                else {
                    relationship = ">=";
                }
            }
        }
    }
    update(oldRecord, newRecord, bid) {
        this.remove(oldRecord, bid);
        this.insert(newRecord, bid);
    }
    vacate() {
        this.tree.vacate();
    }
    static *search(searchIndexManagers, query, bid) {
        let iterables = searchIndexManagers.map((searchIndexManager) => searchIndexManager.search(query, bid));
        let iterators = iterables.map((iterable) => iterable[Symbol.iterator]());
        let searchResults = iterators.map((iterator) => iterator.next().value);
        outer: while (true) {
            let candidates = searchResults
                .map((searchResult, index) => ({ searchResult, index }))
                .filter((candidate) => candidate.searchResult != null)
                .sort((one, two) => {
                return one.searchResult.rank - two.searchResult.rank;
            });
            let candidate = candidates.pop();
            if (candidate == null) {
                break;
            }
            inner: for (let searchIndexManager of searchIndexManagers) {
                let rank = searchIndexManager.computeRecordRank(candidate.searchResult.record, query);
                if (rank != null && rank > candidate.searchResult.rank) {
                    searchResults[candidate.index] = iterators[candidate.index].next().value;
                    continue outer;
                }
            }
            yield candidate.searchResult;
            searchResults[candidate.index] = iterators[candidate.index].next().value;
        }
    }
}
exports.SearchIndexManagerV1 = SearchIndexManagerV1;
;
class SearchIndexManagerV2 {
    recordManager;
    blockManager;
    key;
    tree;
    computeRank(recordTokens, queryTokens) {
        return queryTokens.length - recordTokens.length;
    }
    computeRecordRank(record, query) {
        let recordTokens = this.tokenizeRecord(record);
        let queryTokens = utils_1.Tokenizer.tokenize(query);
        let lastQueryToken = queryTokens.pop() ?? "";
        for (let queryToken of queryTokens) {
            if (recordTokens.find((recordToken) => recordToken === queryToken) == null) {
                return;
            }
        }
        if (recordTokens.find((recordToken) => recordToken.startsWith(lastQueryToken)) == null) {
            return;
        }
        return this.computeRank(recordTokens, [...queryTokens, lastQueryToken]);
    }
    insertToken(token, category, bid) {
        this.tree.insert([
            bedrock.codecs.Boolean.encodePayload(false),
            bedrock.codecs.String.encodePayload(token),
            bedrock.codecs.Integer.encodePayload(category),
            bedrock.codecs.Integer.encodePayload(bid)
        ], bid);
        let codePoints = [...token];
        for (let i = 0; i < codePoints.length + 1; i++) {
            this.tree.insert([
                bedrock.codecs.Boolean.encodePayload(true),
                bedrock.codecs.String.encodePayload(codePoints.slice(0, i).join("")),
                bedrock.codecs.Integer.encodePayload(category),
                bedrock.codecs.Integer.encodePayload(bid)
            ], bid);
        }
    }
    removeToken(token, category, bid) {
        this.tree.remove([
            bedrock.codecs.Boolean.encodePayload(false),
            bedrock.codecs.String.encodePayload(token),
            bedrock.codecs.Integer.encodePayload(category),
            bedrock.codecs.Integer.encodePayload(bid)
        ]);
        let codePoints = [...token];
        for (let i = 0; i < codePoints.length + 1; i++) {
            this.tree.remove([
                bedrock.codecs.Boolean.encodePayload(true),
                bedrock.codecs.String.encodePayload(codePoints.slice(0, i).join("")),
                bedrock.codecs.Integer.encodePayload(category),
                bedrock.codecs.Integer.encodePayload(bid)
            ]);
        }
    }
    readRecord(bid) {
        let buffer = this.blockManager.readBlock(bid);
        let record = this.recordManager.decode(buffer);
        return record;
    }
    tokenizeRecord(record) {
        let value = record[this.key];
        if (typeof value === "string") {
            return utils_1.Tokenizer.tokenize(value);
        }
        return [];
    }
    constructor(recordManager, blockManager, key, options) {
        this.recordManager = recordManager;
        this.blockManager = blockManager;
        this.key = key;
        this.tree = new trees_1.RadixTree(blockManager, options?.bid);
    }
    *[Symbol.iterator]() {
        yield* streams_1.StreamIterable.of(this.search(""));
    }
    delete() {
        this.tree.delete();
    }
    insert(record, bid) {
        let tokens = this.tokenizeRecord(record);
        for (let token of tokens) {
            this.insertToken(token, tokens.length, bid);
        }
    }
    remove(record, bid) {
        let tokens = this.tokenizeRecord(record);
        for (let token of tokens) {
            this.removeToken(token, tokens.length, bid);
        }
    }
    *search(query, bid) {
        let previousResult;
        if (bid != null) {
            let record = this.readRecord(bid);
            let tokens = this.tokenizeRecord(record);
            let rank = 0;
            previousResult = {
                bid,
                record,
                tokens,
                rank
            };
        }
        let queryTokens = utils_1.Tokenizer.tokenize(query);
        let lastQueryToken = queryTokens.pop() ?? "";
        let relationship = previousResult != null ? ">" : ">=";
        let trees = [];
        for (let queryToken of queryTokens) {
            let tree = this.tree.branch([
                bedrock.codecs.Boolean.encodePayload(false),
                bedrock.codecs.String.encodePayload(queryToken)
            ]);
            if (tree == null) {
                return;
            }
            trees.push(tree);
        }
        let tree = this.tree.branch([
            bedrock.codecs.Boolean.encodePayload(true),
            bedrock.codecs.String.encodePayload(lastQueryToken)
        ]);
        if (tree == null) {
            return;
        }
        trees.push(tree);
        while (true) {
            let keys = [];
            if (previousResult != null) {
                keys = [
                    bedrock.codecs.Integer.encodePayload(previousResult.tokens.length),
                    bedrock.codecs.Integer.encodePayload(previousResult.bid)
                ];
            }
            else {
                keys = [
                    bedrock.codecs.Integer.encodePayload(queryTokens.length + 1)
                ];
            }
            let iterables = trees.map((tree) => tree.filter(relationship, keys));
            let iterators = iterables.map((iterable) => iterable[Symbol.iterator]());
            let results = [];
            for (let iterator of iterators) {
                let bid = iterator.next().value;
                if (bid == null) {
                    return;
                }
                let record = this.readRecord(bid);
                let tokens = this.tokenizeRecord(record);
                let rank = 1;
                results.push({
                    bid,
                    record,
                    tokens,
                    rank
                });
            }
            results = results.sort(sorters_1.CompositeSorter.of(sorters_1.NumberSorter.increasing((entry) => entry.tokens.length), sorters_1.NumberSorter.increasing((entry) => entry.bid)));
            let minimumResult = results[0];
            let maximumResult = results[results.length - 1];
            previousResult = maximumResult;
            if (minimumResult.bid === maximumResult.bid) {
                let { bid, record, tokens } = { ...previousResult };
                let rank = this.computeRank(tokens, [...queryTokens, lastQueryToken]);
                yield {
                    bid,
                    record,
                    tokens,
                    rank
                };
                relationship = ">";
            }
            else {
                relationship = ">=";
            }
        }
    }
    update(oldRecord, newRecord, bid) {
        this.remove(oldRecord, bid);
        this.insert(newRecord, bid);
    }
    vacate() {
        this.tree.vacate();
    }
    static *search(searchIndexManagers, query, bid) {
        let iterables = searchIndexManagers.map((searchIndexManager) => searchIndexManager.search(query, bid));
        let iterators = iterables.map((iterable) => iterable[Symbol.iterator]());
        let searchResults = iterators.map((iterator) => iterator.next().value);
        outer: while (true) {
            let candidates = searchResults
                .map((searchResult, index) => ({ searchResult, index }))
                .filter((candidate) => candidate.searchResult != null)
                .sort((one, two) => {
                return one.searchResult.rank - two.searchResult.rank;
            });
            let candidate = candidates.pop();
            if (candidate == null) {
                break;
            }
            inner: for (let searchIndexManager of searchIndexManagers) {
                let rank = searchIndexManager.computeRecordRank(candidate.searchResult.record, query);
                if (rank != null && rank > candidate.searchResult.rank) {
                    searchResults[candidate.index] = iterators[candidate.index].next().value;
                    continue outer;
                }
            }
            yield candidate.searchResult;
            searchResults[candidate.index] = iterators[candidate.index].next().value;
        }
    }
}
exports.SearchIndexManagerV2 = SearchIndexManagerV2;
;
class StoreManager {
    blockManager;
    fields;
    keys;
    orders;
    recordManager;
    table;
    indexManagers;
    searchIndexManagers;
    getDefaultRecord() {
        let record = {};
        for (let key in this.fields) {
            record[key] = this.fields[key].getDefaultValue();
        }
        return record;
    }
    lookupBlockIndex(keysRecord) {
        let key = this.recordManager.encodeKeys(this.keys, keysRecord);
        let index = this.table.lookup(key);
        if (index == null) {
            let key = this.keys.map((key) => keysRecord[key]).join(", ");
            throw `Expected a matching record for key ${key}!`;
        }
        return index;
    }
    constructor(blockManager, fields, keys, orders, table, indexManagers, searchIndexManagers) {
        this.blockManager = blockManager;
        this.fields = fields;
        this.keys = keys;
        this.orders = orders;
        this.recordManager = new records_1.RecordManager(fields);
        this.table = table;
        this.indexManagers = indexManagers;
        this.searchIndexManagers = searchIndexManagers;
    }
    *[Symbol.iterator]() {
        yield* this.filter();
    }
    delete() {
        for (let bid of this.table) {
            this.blockManager.deleteBlock(bid);
        }
        for (let indexManager of this.indexManagers) {
            indexManager.delete();
        }
        for (let searchIndexManager of this.searchIndexManagers) {
            searchIndexManager.delete();
        }
        this.table.delete();
    }
    filter(filters, orders, anchorKeysRecord, limit) {
        orders = orders ?? this.orders;
        for (let key of this.keys) {
            if (!(key in orders)) {
                orders[key] = new orders_1.IncreasingOrder();
            }
        }
        let anchor = anchorKeysRecord != null ? this.lookup(anchorKeysRecord) : undefined;
        let filteredStores = [];
        for (let indexManager of this.indexManagers) {
            let filteredStore = indexManager.filter(filters, orders, anchor);
            if (filteredStore == null) {
                // We can exit early as the index manager has signaled that there are no matching records.
                return [];
            }
            filteredStores.push(filteredStore);
        }
        filteredStores.push(new FilteredStore(this.recordManager, this.blockManager, this.table, filters, orders, anchor));
        let filteredStore = FilteredStore.getOptimal(filteredStores);
        let iterable = streams_1.StreamIterable.of(filteredStore);
        if (limit != null) {
            iterable = iterable.limit(limit);
        }
        return iterable.collect();
    }
    insert(record) {
        let key = this.recordManager.encodeKeys(this.keys, record);
        let encoded = this.recordManager.encode(record);
        let index = this.table.lookup(key);
        if (index == null) {
            index = this.blockManager.createBlock(encoded.length);
            this.blockManager.writeBlock(index, encoded);
            this.table.insert(key, index);
            for (let indexManager of this.indexManagers) {
                indexManager.insert(record, index);
            }
            for (let searchIndexManager of this.searchIndexManagers) {
                searchIndexManager.insert(record, index);
            }
        }
        else {
            let buffer = this.blockManager.readBlock(index);
            // Bedrock encodes records with a payload length prefix making it sufficient to compare the encoded record to the prefix of the block.
            if ((0, tables_1.compareBuffers)([encoded], [buffer.subarray(0, encoded.length)]) === 0) {
                return;
            }
            let oldRecord = this.recordManager.decode(buffer);
            this.blockManager.resizeBlock(index, encoded.length);
            this.blockManager.writeBlock(index, encoded);
            for (let indexManager of this.indexManagers) {
                indexManager.update(oldRecord, record, index);
            }
            for (let searchIndexManager of this.searchIndexManagers) {
                searchIndexManager.update(oldRecord, record, index);
            }
        }
    }
    length() {
        return this.table.length();
    }
    lookup(keysRecord) {
        let index = this.lookupBlockIndex(keysRecord);
        let buffer = this.blockManager.readBlock(index);
        let record = this.recordManager.decode(buffer);
        return record;
    }
    remove(keysRecord) {
        let key = this.recordManager.encodeKeys(this.keys, keysRecord);
        let index = this.table.lookup(key);
        if (index != null) {
            let buffer = this.blockManager.readBlock(index);
            let oldRecord = this.recordManager.decode(buffer);
            this.table.remove(key);
            this.blockManager.deleteBlock(index);
            for (let indexManager of this.indexManagers) {
                indexManager.remove(oldRecord);
            }
            for (let searchIndexManager of this.searchIndexManagers) {
                searchIndexManager.remove(oldRecord, index);
            }
        }
    }
    search(query, anchorKeysRecord, limit) {
        let anchorBid = anchorKeysRecord != null ? this.lookupBlockIndex(anchorKeysRecord) : undefined;
        let iterable = streams_1.StreamIterable.of(SearchIndexManagerV1.search(this.searchIndexManagers, query, anchorBid));
        if (limit != null) {
            iterable = iterable.limit(limit);
        }
        return iterable.collect();
    }
    update(keysRecord) {
        let record = {
            ...this.getDefaultRecord(),
            ...keysRecord
        };
        try {
            record = {
                ...this.lookup(keysRecord),
                ...keysRecord
            };
        }
        catch (error) { }
        return this.insert(record);
    }
    vacate() {
        for (let bid of this.table) {
            this.blockManager.deleteBlock(bid);
        }
        for (let indexManager of this.indexManagers) {
            indexManager.vacate();
        }
        for (let searchIndexManager of this.searchIndexManagers) {
            searchIndexManager.vacate();
        }
        this.table.vacate();
    }
    static construct(blockManager, options) {
        let fields = options.fields;
        let keys = options.keys;
        let orders = options.orders ?? {};
        let indices = options.indices ?? [];
        let searchIndices = options.searchIndices ?? [];
        let recordManager = new records_1.RecordManager(fields);
        let storage = new tables_1.Table(blockManager, {
            getKeyFromValue: (value) => {
                let buffer = blockManager.readBlock(value);
                let record = recordManager.decode(buffer);
                return recordManager.encodeKeys(keys, record);
            }
        });
        let indexManagers = indices.map((index) => new IndexManager(recordManager, blockManager, index.keys));
        let searchIndexManagers = searchIndices.map((index) => new SearchIndexManagerV1(recordManager, blockManager, index.key));
        let manager = new StoreManager(blockManager, fields, keys, orders, storage, indexManagers, searchIndexManagers);
        return manager;
    }
}
exports.StoreManager = StoreManager;
;
class Index {
    keys;
    constructor(keys) {
        this.keys = keys;
    }
    equals(that) {
        if (this.keys.length !== that.keys.length) {
            return false;
        }
        for (let i = 0; i < this.keys.length; i++) {
            if (this.keys[i] !== that.keys[i]) {
                return false;
            }
        }
        return true;
    }
}
exports.Index = Index;
;
class SearchIndex {
    key;
    constructor(key) {
        this.key = key;
    }
    equals(that) {
        return this.key === that.key;
    }
}
exports.SearchIndex = SearchIndex;
;
class Store {
    fields;
    keys;
    orders;
    indices;
    searchIndices;
    constructor(fields, keys, orders) {
        this.fields = fields;
        this.keys = keys;
        this.orders = orders ?? {};
        this.indices = [];
        this.searchIndices = [];
        this.index(this.createIndex());
        for (let key in fields) {
            if (fields[key].getSearchable()) {
                this.searchIndices.push(new SearchIndex(key));
            }
        }
    }
    createIndex() {
        let keys = [];
        for (let key in this.orders) {
            let order = this.orders[key];
            if (order == null) {
                continue;
            }
            if (!keys.includes(key)) {
                keys.push(key);
            }
        }
        for (let key of this.keys) {
            if (!keys.includes(key)) {
                keys.push(key);
            }
        }
        return new Index(keys);
    }
    index(that) {
        for (let index of this.indices) {
            if (index.equals(that)) {
                return;
            }
        }
        this.indices.push(that);
    }
}
exports.Store = Store;
;
class OverridableWritableStore {
    storeManager;
    overrides;
    constructor(storeManager, overrides) {
        this.storeManager = storeManager;
        this.overrides = overrides;
    }
    async filter(...parameters) {
        return this.overrides.filter?.(...parameters) ?? this.storeManager.filter(...parameters);
    }
    async insert(...parameters) {
        return this.overrides.insert?.(...parameters) ?? this.storeManager.insert(...parameters);
    }
    async length(...parameters) {
        return this.overrides.length?.(...parameters) ?? this.storeManager.length(...parameters);
    }
    async lookup(...parameters) {
        return this.overrides.lookup?.(...parameters) ?? this.storeManager.lookup(...parameters);
    }
    async remove(...parameters) {
        return this.overrides.remove?.(...parameters) ?? this.storeManager.remove(...parameters);
    }
    async search(...parameters) {
        return this.overrides.search?.(...parameters) ?? this.storeManager.search(...parameters).map((entry) => entry.record);
    }
    async update(...parameters) {
        return this.overrides.update?.(...parameters) ?? this.storeManager.update(...parameters);
    }
    async vacate(...parameters) {
        return this.overrides.vacate?.(...parameters) ?? this.storeManager.vacate(...parameters);
    }
}
exports.OverridableWritableStore = OverridableWritableStore;
;
