"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("./test");
const contexts_1 = require("./contexts");
(0, test_1.test)(`It should work.`, async (assert) => {
    let context = new contexts_1.Context();
    let users = context.createStore({
        user_id: context.createStringField(),
        name: context.createStringField(),
        age: context.createIntegerField()
    }, ["user_id"], {
        name: context.createIncreasingOrder()
    });
    let posts = context.createStore({
        post_id: context.createStringField(),
        user_id: context.createStringField(),
        title: context.createStringField()
    }, ["post_id"]);
    let userPosts = context.createLink(users, posts, {
        user_id: "user_id"
    }, {
        title: context.createIncreasingOrder()
    });
    let query = context.createQuery(users, {
        name: context.createEqualityOperator(),
        age: context.createEqualityOperator()
    });
    let { transactionManager } = context.createTransactionManager("./private/atlas", {
        users,
        posts
    }, {
        userPosts
    }, {
        query
    });
    await transactionManager.enqueueWritableTransaction(async (queue, { users, posts }, { userPosts }, { query }) => {
        users.insert({
            user_id: "User 1",
            name: "Joel Ek",
            age: 38
        });
        posts.insert({
            post_id: "Post 1",
            user_id: "User 1",
            title: "Some title."
        });
    });
    let observed = await transactionManager.enqueueReadableTransaction(async (queue, { users, posts }, { userPosts }, { query }) => {
        let allUserPosts = await userPosts.filter({
            user_id: "User 1"
        });
        return users.lookup({
            user_id: "User 1"
        });
    });
    let expected = {
        user_id: "User 1",
        name: "Joel Ek",
        age: 38
    };
    assert.record.equals(observed, expected);
});
