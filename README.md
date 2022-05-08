# GONUT

A Telegram bot that manage crypto wallets and scheule tasks, just reach [@gonut_bot](https://t.me/gonut_bot) for its service.

### STATE 

- Security : is a joke, since I have removed lock/unlock wallet mechanism to let users test with comfort. 
- TestNet : The bot it running on Testnet so no worry and just have fun spamming it.
- WARNING : DON'T TRANSFER YOUR MAINNET XTZ TO BOT WALLET

### SETUP
If you are curious or just want to verify if I may steal your XTZ :D

        npm i 
        export TELEGRAM_TOKEN="YOUR_TOKEN"
        npm start

### COMMANDS

1. Account 

        start - start private wizard
        create - create new wallet
        balance - show your balance
        export - show your mnemonic words
        lock/unlock - encrypt wallet w/ your password (planned)
        
2. Wallet & utils 
        
        coin - fetch price : coin btc
        send - send token to address : send tz1.... <amount>
        tip - tip token to @user : tip @username <amount>
        show - balance of someone in public chat: show @someone
        wallet_list - show list of all created wallets
        
3. Groups, RPC network & Admins 
        
        rpc_list - show rpc list
        rpc - admin can change rpc by : rpc <link/enum>
        
        group_list - admin can show sub list
        group_sub - admin can subscribe a group to be broadcasted
        group_reset - admin can remove group list
        
        admin_list - admin can list all current admins
        admin_add - admin can promote another @admin
        reset_db - admin can reset the whole database
        clean_time - admin can cleanup duration on private chat: <seconds>
        
        
### NOTE 

- Price oracle is done via simple request to [DIADATA](https://api.diadata.org/v1/quotation/BTC?Price)
- main wallet api is [Tezallet](https://www.npmjs.com/package/tezallet) - my other library based on Taquito & various crypto libs.
