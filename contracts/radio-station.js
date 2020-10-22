({
    init () {
        
    },

    async broadcast (data) {
        await lpush("messages", JSON.stringify(data));
    },

    async listen (from=0, to=-1) {
        const msgs = lrange("messages", from, to);

        return msgs.map(x => JSON.parse(x))
    }

})