# gonut
A Telegram bot that interact with crypto wallets and scheule tasks.

You may access it via Telegram by @gonut_bot

### Setup

        npm i 
        export TELEGRAM_TOKEN="YOUR_TOKEN"
        npm start

### Commands

        start - start private wizard
        create - create new wallet
        balance - show your balance
        export - show your mnemonic words
        coin - fetch price : coin btc
        send - send token to address : send tz1.... <amount>
        tip - tip token to @user : tip @username <amount>
        show - balance of someone in public chat: show @someone
        wallet_list - show list of all created wallets
        rpc_list - show rpc list
        
        rpc - admin can change rpc by : rpc <link/enum>
        group_list - admin can show sub list
        group_sub - admin can subscribe a group to bot broadcast
        group_reset - admin can remove group list
        reset_db - admin can reset the whole database
        admin_list - admin can list all current admins
        admin_add - admin can promote another @admin
        clean_time - admin can cleanup duration on private chat: <seconds>

