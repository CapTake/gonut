// Main 
const ROOT = "JackDragoon".toUpperCase()
const WELCOME_MSG = "👋"
const TOKEN = process.env.TELEGRAM_TOKEN

const DURATION_5_MINUTE = 5*60*1000  // 5 minute
const DURATION_A_MINUTE = 60*1000    // 1 minute
const DURATION_5SECS = 5*1000        // 5 secs
let cleanup_duration = DURATION_A_MINUTE // init
//
// DB
//
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import TelegramBot from 'node-telegram-bot-api'
import * as tezallet from 'tezallet'
import pkg from 'pg'
const { Client } = pkg
//
// WebHooks
// 
let hook_to_heroku = () => {
    const options = {webHook: {port: process.env.PORT}}
    console.log(`PORT: ${process.env.PORT}`)

    const url = process.env.APP_URL || APP_URL
    console.log(`APP_URL: ${url}`)

    const bot = new TelegramBot(TOKEN, options)
    bot.setWebHook(`${url}/bot${TOKEN}`)

    return bot
}
// deploy:
// const bot = hook_to_heroku()
// Test Local:
const bot = new TelegramBot(TOKEN, {polling: true});

//
// Database
//
const __dirname = dirname(fileURLToPath(import.meta.url))
const file = join(__dirname, 'low.sql')
import * as fs from 'fs'
import { setTimeout } from 'timers'
import { error } from 'console'

// In-Memory DB
let db = {}

const pool = new Client(
    process.env.DATABASE_URL ?  
    {
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false 
        }
    } 
    :{
        user: 'gonut',
        password: 'tezallet',
        host: 'localhost',
        port: 5432,
        database: 'low'
    }
)

const db_init = () => {
    fs.readFile(file, (err, data) => {
        if (err) { 
            console.error("[fs.readFile]:" + err)
            return
        } 
        console.log(`[query]:\n${data}`)
        //
        // execute init query to create tables.
        pool.query(data.toString(), (err, _) => {
            if(err) console.log(`[query]: ${err.message}`)
            else console.log(`[query] initialized.`)
        })
    })
}
 
const db_connect = () => {
    pool.connect().then(()=>{
        db = {groups:[], admins:[{'username':ROOT}], wallets:[]}
        console.log("[postgres] db connected. Init db..")
        // reading schema to setup db
        db_init()
    })
}

const db_read = (table, callback) => {
    // QUERY ALL >> reload db
    pool.query(`SELECT * FROM ${table}`, (err, res)=>{       
        // ERR 
        if(err) {
            console.log(`[query]: ${err.message}`)
        }
        // OK
        else {
            db[table] = res.rows
            callback()
            // console.log(`\n[db] read:${ res.rows.length === 0 ? 'empty':'loaded'}\n\n`, db)
        }
    })
}

// init pool //
db_connect()


const broadcast_greeting = () => {
    // save/load registered chat group to memorize
    let groups = db.groups
    if(groups.length > 0){
        let message = ""
        for(let i = 0; i < groups.length; i++){
            bot.sendMessage(groups[i].id, WELCOME_MSG);
            console.log(`[init] sent live signal to [${groups[i].title}]`)
        }
        console.log("[init] broadcasted.")
    } else {
        console.log("[init] groups empty.")
    }
}

//
// TEZOS WALLET 
//
// Ithaca Testnet
let toolkit = tezallet.init_tezos_toolkit(tezallet.RPC_URL.ECAD_LABS_Ithacane)


//
// COMMANDS
//
const wallet_explorer = (account) => {
    return `<a href="https://tzkt.io/${account}/operations/">${account}</a>`;
}

const get_secret_from_season = (account, msg) => {

    let secret = null

    // find unlocked season
    const existed_season = IMP.find(i => i.username === account.username)

    // found season
    if(existed_season){

        // log
        // console.log(`[get_secret_from_season] season:`, existed_season)

        // get password here:
        const password = existed_season['password']
        // console.log(`[get_secret_from_season] ${msg.from.id}.${password}`)

        // decrypt [mnemonic] with [password]
        secret = decrypt_secret_with_password(account, msg.from.id, password)
        // console.log(`[get_secret_from_season] secret`, secret)
    }
    else { // still locked.
        bot.sendMessage(msg.chat.id, `Please unlock wallet first.`)
    }
    return secret
}

// SIGNER
const get_signer = async (msg, account) => {
    
    // init 
    tezallet.reset()
    let signer = null
    let secret = null

    // ensure it pass
    try {
        console.log("[get_signer] begin :")
        // console.log(`[salt] ${mid}.${account.username}`)

        // account is encrypted
        if(account.is_locked) {

            // request from IMP
            secret = get_secret_from_season(account, msg)
        }
        else {
            /// decrypt [mnemonic] 
            secret = decrypt_secret(account, msg.from.id)
        }

        // log
        // console.log(`[get_signer] parsed secret = `,secret)

        // create signer
        signer = tezallet.create_signer(secret, 0)
        
        // erase memory.
        secret = null
        return signer
    } 
    catch(e){
        // log
        console.log(e)

        // send none if locked
        if(!account.is_locked) 
            bot.sendMessage(msg.chat.id, 
            rep_mnemonic_mismatched())
            .then(msg => msg_stack.push(msg))

        // null
        return signer
    }
}

//
// Public Tooling 
//
const time_stop = (counter) => {
    return (Math.round(((new Date()).getTime() - counter) / 3600) * 1000) / 1000
}

const execute_transfer = async (msg_transfer, account, dest, amount) => {

    /// is account info valid ?
    let signer = await get_signer(msg_transfer, account)

    // valid
    if(signer != null){

        // count 
        let counter = (new Date()).getTime()

        // feedback on sending tx
        let msg_waiting = await bot.sendMessage(
            msg_transfer.chat.id,
            `<i>sending <code>${amount} tez</code> of ` +
            `${msg_transfer.from.first_name} >> ${dest} ....</i>`, 
            {parse_mode:"HTML"})

        // execute transfer [dest] [amount] [signer]
        tezallet.transfer(dest, amount, false, signer).then(
            // Success
            ()=>{
                // delete old waiting message
                bot.deleteMessage(msg_waiting.chat.id, msg_waiting.message_id)
                    
                // counting
                counter = time_stop(counter)

                // sending completed tx
                bot.sendMessage(msg_transfer.chat.id, 
                    `${msg_transfer.from.first_name} sent  `
                    +`<code>${amount} tez </code>`
                    +`to <code>${dest}</code> after`
                    +`<code> ${counter} secs</code>`, 
                    {parse_mode:"HTML"})

                // clear up
                tezallet.reset()
            }, 
            // Failure
            (reason)=>{
                // delete old waiting message
                bot.deleteMessage(msg_waiting.chat.id, msg_waiting.message_id)

                // counter 
                counter = time_stop(counter)

                // log
                console.log(`[transfer] failed to transfer`
                +` ${amount} from ${msg_transfer.from.first_name}`
                +` to ${dest} after ${counter} secs.\n`, reason)

                // sending error tx
                bot.sendMessage(msg_transfer.chat.id, 
                    `<i>${msg_transfer.from.first_name} failed to send `
                    +`<code>${dest}</code> with `
                    +`<code>${amount} tez </code> after ${counter} secs:\n`
                    +`${reason.status} - ${reason.statusText}</i>`, 
                    {parse_mode:"HTML"})

                // clear up
                tezallet.reset()
            }
        )
    } else {
        // failed to send 
        console.log(`[send] failed to transfer [${amount}tez]`
        +` from ${account.username} to ${dest}`)
    }
    
}

const no_wallet_feedback = (msg_transfer, username) => {
    bot.sendMessage(msg_transfer.chat.id, 
        `${username} has no wallet.\n`)
}

// TIP @username amount
bot.onText(/\/tip @(.+) ([0-9]*[.]?[0-9]+)/, (msg_transfer, match) => {
    db_read('wallets', ()=>{

        // has username ?
        let username = get_cap_username(msg_transfer)
        if(!username) return 

        // has account ?
        let account = db.wallets.find(item => item.username === username)

        // alright..
        if (account){ 

            // get dest address by username
            const dest_username = match[1].toUpperCase()
            let dest = db.wallets.find(item => item.username === dest_username)
            console.log(`[tip] src = ${account.username} >> dest = ${dest.username}`)

            // get amount to transfer
            const amount = Number.parseFloat(match[2].toString())
            console.log(`[tip] amount = ${amount}`)

            // dest has no wallet 
            if(!dest) {
                no_wallet_feedback(msg_transfer, dest_username)

                // create one now
                create_account(dest_username, msg_transfer).then(dest_address => {

                    // transfer to newly created address:
                    execute_transfer(msg_transfer, account, dest_address, amount)
                })
            }

            // alright..transfer to dest.public_key
            else execute_transfer(msg_transfer, account, dest.public_key, amount)


        // user has no wallet
        } else no_wallet_feedback(msg_transfer, username)
    })
})

// SEND
bot.onText(/\/send (.+) ([0-9]*[.]?[0-9]+)/, (msg_transfer, match) => {
    db_read('wallets', ()=>{
        
        // get username
        let username = get_cap_username(msg_transfer)
        if(!username) return

        // has wallet ?
        let account = db.wallets.find(item => item.username === username)

        // proceed !
        if (account){

            // get dest address + amount
            const dest_address = match[1].toString()
            const amount = Number.parseFloat(match[2].toString())

            // transfer!
            execute_transfer(msg_transfer, account, dest_address, amount)

        // error: user has no wallet yet
        } else no_wallet_feedback(msg_transfer, username)
        
    })
})

let fetch_price = async (coin='xtz') => { 
    let result = await fetch(`https://api.diadata.org/v1/quotation/${coin.toUpperCase()}`, {method: 'GET'})
    
    if(result.ok) {
        let r = await result.text()
        r = JSON.parse(r)
        return Number.parseFloat(r[`Price`])
    } else {
        console.log(result.status)
        return -1
    }
}
const to_num = (num, range=100) => Math.round(num * range) / range
const to_usd = (amount, fix=2) => "$" + amount.toFixed(fix).replace(/\d(?=(\d{3})+\.)/g, "$&,")
const balance_usd = (balance, price) => price > 0.0 ? ` (${to_usd(price*balance)})`: ``

const get_balance = (msg, public_key) => {
    fetch_price('xtz').then(price => {
        // 2. get_balance
        tezallet.get_balance(public_key).then((balance)=>{
            bot.sendMessage(msg.chat.id, 
                `<code>${wallet_explorer(public_key)}</code>\n`
                +`<i>Balance :</i> <code>${to_num(balance)} xtz`
                + `${balance_usd(balance, price)}</code>`,
                {parse_mode:'HTML'})
        })
    })
}

const show_balance = (username, msg) => {
    
    // 1. get [public_key] from db
    db_read('wallets', ()=>{
    
        // find recorded account 
        let account = db.wallets.find(item => item.username == username)

        if(account){ // created ?
            get_balance(msg, account.public_key)
        } 
        else { // no wallet yet.
            no_wallet_feedback(msg, username)
        }
    })
}

// BALANCE
bot.onText(/\/balance/, (msg) => {
    
    // get user
    let username = get_cap_username(msg)
    if(!username) return

    // show now
    show_balance(username, msg)
})

// SHOW @account
bot.onText(/\/show @(.+)/, (msg, match)=>{

    // log
    console.log(`[show] @${match[1]}`)

    // get username
    let username = match[1].toString().toUpperCase()

    // show now !
    show_balance(username, msg)
})

// SHOW address
bot.onText(/\/show tz(.+)/, (msg, match)=> {

    // log
    console.log(`[show] tz${match[1]}`)

    // get balance directly from address
    get_balance(msg, `tz${match[1]}`)
})

// WALLET_LIST
bot.onText(/\/wallet_list/, (msg) => {
    console.log(`[wallet_list] requested from ${msg.chat.username||msg.chat.first_name}`)
    // permissioned
    // if(!is_admin(msg)) return
    db_read('wallets', ()=>{
        if(db.wallets){
            let index = 0
            let acc = ""
            db.wallets.map(w => {
                index = index + 1
                acc += `<code>${w.public_key}</code> - owner: <code>${w.username}</code>\n`
            })
            // acc += "</code>"
            acc = `<b>WALLETS</b> (${index})\n` + acc
            bot.sendMessage(msg.chat.id, acc, {parse_mode:"HTML"})
        }
    })
})

// PRICE
bot.onText(/\/coin (.+)/, (msg, match) =>{
    const coin = match[1].toUpperCase()
    fetch(`https://api.diadata.org/v1/quotation/${coin}`, {method: 'GET'}).then((result =>{
        if(result.ok) result.text().then(r => {
            console.log(r)
            r = JSON.parse(r)
            bot.sendMessage(msg.chat.id, 
                `<code>${r.Symbol}: ${to_usd(r['Price'], 4)}\n`
                +`24h: ${to_usd(r['PriceYesterday'], 4)}\n`
                +`Vol: ${to_usd(r['VolumeYesterdayUSD'],1)}\n`
                +`</code>`, {parse_mode:'HTML'})
            // remove user request msg
            bot.deleteMessage(msg.chat.id, msg.message_id)
        })
    }))
})

// USERNAME
bot.onText(/\/username/, (msg) => {
    bot.sendMessage(msg.chat.id, `your username is @${msg.from.username}`)
})

// ADMIN_LIST
bot.onText(/\/admin_list/, (msg) => {
    db_read('admins', () => {
        if(db){
            db ||= {admins:[]}
            if(db.admins.length > 0){
                let message = "<code>Admin:\n"
                for(let i = 0; i < db.admins.length; i++){
                    message += `\n@${db.admins[i].username} `
                }
                bot.sendMessage(msg.chat.id, message + "</code>",{parse_mode : "HTML"})
            } else {
                /////
            }
        }
    })
})


/**
 * Message Stack for cleaning up chat.
 */
let msg_stack = []

/**
 * Execute the cleanup process for message stack.
 * @returns 
 */
const clean_stack = () => {
    if(msg_stack.length === 0) return
    msg_stack.map(m => clean_msg(m))
    msg_stack = []
}

/**
 * Clean up a message.
 * @param {TelegramBot.Message} m message to be clean up
 * @param {Boolean} timed is this from a timed request ?
 */
const clean_msg = (m, timed=false, no_log=false) => {
    let mid = m.message_id
    let removed_content = no_log ? ' (censored)' : m.text 
    let log = `[${mid}]:${removed_content}`
    let mode = `[${timed?'clean_timed':'clean_msg'}]`
    bot.deleteMessage(m.chat.id, mid).then(is_deleted =>{
         console.log(`${mode} ${is_deleted ? 'deleted': 'cant delete'} ${log}`)
    }, reason => {
        console.log(`${mode} cant delete ${log}\n${reason}`)
    })
}
/**
 * Remove a message after a time set.
 * @param {String} msg message to be removed after [time] duration
 * @param {Number} time duration to clean up
 * @returns 
 */
const clean_after = (msg, time, no_log = false) => setTimeout(() => clean_msg(msg,true, no_log), time)

/**
 * Schedule a cleaning for all pushed messages.
 */
const clean_all = () => {
    console.log(`[clean_all] requested w/ stack = ${msg_stack.length} msg`)
    if(msg_stack.length > 0) setTimeout(() =>{clean_stack()}, DURATION_A_MINUTE)
}

const get_cap_username = (msg) => {
    if(msg.chat){
        let username = msg.from.username
        if(username) return username.toUpperCase()
        else {
            console.log("[start] user don't have username.")
            bot.sendMessage(msg.chat.id,
                `Please set an username before using this wallet.`)
                .then(msg_refuse => msg_stack.push(msg_refuse))
            return null
        }
    } else {
        throw error('[get_cap_username] not found [msg] in arg !')
    }
}

// *START
bot.onText(/\/start/, (msg_start)=>{
    if(msg_start.chat.type === 'private'){
        // add to cleanup
        msg_stack.push(msg_start)
        db_read('wallets', ()=>{
            // get username
            let username = get_cap_username(msg_start)
            // is valid ?
            if(username){
                let account = db.wallets.find(i => i.username === username)
                bot.sendMessage(msg_start.chat.id,  
                    "<b>Private Actions:</b>\n\n" +
                    "/create - new wallet\n" +
                    (account ? // if has account :
                    "/balance - show account\n" +
                    "/pass - encrypt your mnemonic with: /pass [password]\n" +
                    "/lock - lock your wallet by: /lock\n" +
                    "/unlock - unlock your wallet by: /unlock [password]\n" +
                    "/export - your wallet mnemonic as 5-secs text\n" +
                    "/remove - remove current wallet to create new one\n" 
                    : ""), // else just hide it.
                    {parse_mode:"HTML"})
                .then(msg_option => {
                    clean_after(msg_option, DURATION_A_MINUTE) // after 1 min
                    clean_all()                                // schedule cleanup
                })
            }
        })
    }
})


const decrypt_secret = (account) => {
    return tezallet.decrypt_mnemonic(account.mnemonic, 
        tezallet.encrypt_password(
            `${TOKEN}.${account.public_key}`,
            `${account.username}`, 16),
        Buffer.from(account.init_vec, 'base64'))
}

const encrypt_secret = (mnemonic, public_key, username, init_vec) => {
    return tezallet.encrypt_mnemonic(mnemonic, 
        tezallet.encrypt_password(
            `${TOKEN}.${public_key}`,
            `${username}`, 16),
        Buffer.from(init_vec, 'base64'))
}

const decrypt_secret_with_password = (account, mid, password) => {
    return tezallet.decrypt_mnemonic(account.mnemonic, 
        tezallet.encrypt_password(
            `${TOKEN}.${password}`,
            `${mid}.${account.username}`, 16),
        Buffer.from(account.init_vec, 'base64'))
}

const encrypt_secret_with_password = (mnemonic, password, mid, username, init_vec) => {
    return tezallet.encrypt_mnemonic(mnemonic, 
        tezallet.encrypt_password(
            `${TOKEN}.${password}`,
            `${mid}.${username}`, 16),
        Buffer.from(init_vec, 'base64'))
}

const update_encrypt_mnemonic = (mnemonic, password, mid, account, username, msg_lock) => {

    // 1-way encrypted password.
    const encrypted_password = tezallet.encrypt_password(
        password, `${mid}.${account.public_key}`, 16)

    // secret need to be encrypted with encrypted_password
    const encrypted = encrypt_secret_with_password(
        mnemonic, 
        encrypted_password, 
        mid, username,
        account.init_vec) 

    // QUERY
    pool.query(
        "UPDATE wallets SET mnemonic = $1, is_locked = $2 WHERE username = $3;",
        [ encrypted, true, username], (err,_)=>{

            // error ?
            if(err) console.log(err)
            else console.log(`[set_lock] updated (encrypted)mnemonic for ${username}`)

            // erase IMP if exist
            IMP = IMP.filter(i => i.username != username)

            // successfully !
            bot.sendMessage(msg_lock.chat.id, 
            `encrypted wallet for <code>${username}</code>${err ? err.message:''}`,
            {parse_mode:'HTML'})
            .then((msg_created) => clean_after(msg_created, DURATION_5SECS))
        }
    )
}

let IMP = []
const remove_season_of = (account) => {

    // find season of account
    let existed_season = IMP.find(i => i.username === account.username)

    // remove if existed
    if(existed_season){
        IMP = IMP.filter(i => i.username != account.username)
        return true
    }
    return false
}

// +SET_LOCK <password>
bot.onText(/\/pass (.+)/, (msg_lock, match)=>{
    // private only
    if(msg_lock.chat.type != 'private') return

    // hide password right away.
    clean_msg(msg_lock)
    
    db_read('wallets', ()=>{

        const username = get_cap_username(msg_lock)
        if(username){

            // get account
            const account = db.wallets.find(i => i.username === username)
            if(account){

                // get message info
                const mid = msg_lock.from.id
                const password = match[1].toString()

                // not yet lock account ?
                if(!account.is_locked){

                    // log
                    console.log(`[set_lock] locking account`, account)

                    // return
                    try {
                        // decrypt current mnemonic
                        const mnemonic = decrypt_secret(account, mid)
                        
                        // encrypt again with new password
                        update_encrypt_mnemonic(mnemonic, password, mid, account, username, msg_lock)

                    } catch(e) {
                        console.log(e)
                        bot.sendMessage(msg_lock.chat.id, rep_cant_setup_lock)
                    }
                }
                // locked => re-lock ?
                else {
                    // log 
                    console.log(`[set_lock] re-locking account`, account)

                    // unlocked yet ? 
                    const secret = get_secret_from_season(account, msg_lock)

                    if(secret){
                        try {
                            // encrypt again with new password
                            update_encrypt_mnemonic(secret, password, mid, account, username, msg_lock)
                        } 
                        catch(e){
                            console.log(e)
                            bot.sendMessage(msg_lock.chat.id, rep_cant_setup_lock)
                        }
                    } 
                    // not yet unlocked
                    else {
                        // feedback
                        bot.sendMessage(msg_lock.chat.id, `You need to unlock first.`)
                    }
                }
            }
            else { // no account/wallet yet
                no_wallet_feedback(msg_lock, username)
            }
        }
    })

})

// *LOCK
bot.onText(/\/lock/, msg_lock => {

    // get username
    const username = get_cap_username(msg_lock)
    if(username){

        // db check
        db_read('wallets', () => {
        
            // seek account
            const account = db.wallets.find(i => i.username === username)

            if(account){
                // remove season
                console.log(`[lock] current IMP`, IMP)
                const result = remove_season_of(account)
                console.log(`[lock] new IMP`, IMP)

                // feedback
                bot.sendMessage(msg_lock.chat.id, 
                    account.is_locked ?
                    `Your account has been ${result ? '': 'always'} locked.`
                    : `You haven't setup lock yet. /pass to start.`)
            }
        })
    }
})

let UNLOCK_FAIL = {}
const UNLOCK_MAX = 3

// *UNLOCK <password>
bot.onText(/\/unlock (.+)/, (msg_unlock, match) => {

    // private only
    if(msg_unlock.chat.type != 'private') return

    // hide password right away.
    clean_msg(msg_unlock)

    db_read('wallets', ()=>{

        const username = get_cap_username(msg_unlock)

        if(!username) return

        if(username){
            // check how many attempts user made :
            if(UNLOCK_FAIL[username]){
                const attempts = UNLOCK_FAIL[username].attempts

                if(attempts === UNLOCK_MAX){
                    const now = (new Date()).getTime()
                    const duration = DURATION_5_MINUTE - (now - UNLOCK_FAIL[username].time)

                    if(duration > 0){
                        const time_left = to_num(duration / (60*1000), 2)
                        // feedback
                        bot.sendMessage(msg_unlock.chat.id, 
                            `You have failed ${UNLOCK_MAX} times, please wait ${time_left} mins.`)
                        // break
                        return
                    } else {
                        UNLOCK_FAIL[username].attempts = 0
                        UNLOCK_FAIL[username].time = now
                        console.log(`[unlock] unbanned ${username} at ${now}`)
                    }
                }
            }

            // get account
            const account = db.wallets.find(i => i.username === username)
            if(account){

                // get message info
                const mid = msg_unlock.from.id
                const password = match[1].toString()

                // lock is set ?
                if(account.is_locked){
                    
                    const existed_season = IMP.find(i => i.username === username)

                    // unlocked
                    if(existed_season){

                        // feedback
                        bot.sendMessage(msg_unlock.chat.id, `Your wallet is already unlocked.`)
                    }
                    else { // unlock new season

                        const encrypted_password = tezallet.encrypt_password(
                            password, `${mid}.${account.public_key}`, 16)
                        
                        try {
                            // to override later
                            remove_season_of(account)

                            // adding new season
                            IMP.push({
                                'username' : username,
                                'password' : encrypted_password
                            })
                            
                            get_signer(msg_unlock, account).then(signer =>{
                                if(signer){
                                    // feedback
                                    bot.sendMessage(msg_unlock.chat.id, `Your wallet is unlocked.`)  
                                }
                                else{
                                    // to cleanup
                                    remove_season_of(account) 
                            
                                    // feedback
                                    bot.sendMessage(msg_unlock.chat.id, `Wrong password. Try again.`)
                                    
                                    // counting..
                                    if(UNLOCK_FAIL[account.username])
                                    {
                                        UNLOCK_FAIL[account.username].attempts += 1
                                        if(UNLOCK_FAIL[account.username].attempts === UNLOCK_MAX)
                                        {
                                            console.log(`[unlock] max attempts reached for ${username}`)
                                            
                                            // save timestamp
                                            UNLOCK_FAIL[account.username].time = (new Date()).getTime()
                                        }
                                    }
                                    else {
                                        // init data for user
                                        UNLOCK_FAIL[account.username] = {} 
                                        UNLOCK_FAIL[account.username].attempts = 1
                                    }

                                    // log
                                    console.log(UNLOCK_FAIL)
                                }
                                // empty
                                signer = null
                            })
                        } catch(e){
                            // log
                            console.log(e)
                        }
                    }
                }
                else { // lock isn't set ?
                    bot.sendMessage(msg_unlock.chat.id, `You haven't set password yet.`)
                }
            }
            else { // no account/wallet yet
                no_wallet_feedback(msg_unlock, username)
            }
        }
    })
})

const create_account = async (username, msg_create_req) => {

    // generate account info
    const init_vec = tezallet.init_vector()
    const mnemonic = tezallet.generate_mnemonic()
    const signer = tezallet.create_signer(mnemonic, 0) 

    // get pk
    let public_key = await signer.publicKeyHash()

    // insert account into database
    pool.query(
    "INSERT INTO wallets (username,public_key,mnemonic,init_vec)"
    +" VALUES ($1,$2,$3,$4)",
    [
        username,   // #1
        public_key, // #2
        encrypt_secret(mnemonic, public_key, username, init_vec), 
        init_vec.toString('base64')

    ],(err,_)=>{
        // error ?
        if(err) console.log(err)

        // successfully !
        bot.sendMessage(msg_create_req.chat.id, 
        `new wallet <code>${public_key}</code> for ${username}\n`
        +`please secure your account with new password by : /pass [password]\n`
        +`${err ? err.message:''}`,
        {parse_mode:'HTML'})
        .then((msg_created) => msg_stack.push(msg_created))

        
    })
    return public_key
}

// +CREATE
bot.onText(/\/create/, (msg_create_wallet)=>{
    // private chat only
    if(msg_create_wallet.chat.type != 'private') return

    // get username
    const username = get_cap_username(msg_create_wallet)
    if(!username) return

    // clean up
    msg_stack.push(msg_create_wallet)
    clean_stack()

    // read db first
    db_read('wallets', ()=>{
        
        // has wallet yet ?
        let account = db.wallets.find(item => item.username === username)

        //  if not-existed wallet :
        if(!account){

            // trigger creating account
            create_account(username, msg_create_wallet)

        } else {

            // feedback
            bot.sendMessage(msg_create_wallet.chat.id, 
            `<i>you already has wallet</i>\n` + wallet_explorer(account.public_key),
            {parse_mode:'HTML'})
            .then((msg_account_exist)=> msg_stack.push(msg_account_exist))
        }
    })

})

// -REMOVE
bot.onText(/\/remove/, (msg_reset)=>{
    // private chat only
    if(msg_reset.chat.type != 'private') return

    // get username
    let username = get_cap_username(msg_reset)
    if(!username) return


    // clean up
    let root = msg_reset.chat.id
    clean_msg(msg_reset)

    // make it run once
    let is_ready_now = false

    // inline question
    bot.sendMessage(root, 
        `Are you sure to remove current wallet ?`,
        {"reply_markup" : {"keyboard" : [[
            "Yes, I need a new one", 
            "No, still using it"]],
        "one_time_keyboard": true
        }}).then( msg_ready_await => { 

            // console.log("[remove] awaiting answer...")
            // clean up
            msg_stack.push(msg_ready_await)

            // Question
            bot.onText(/Yes, I need a new one/, (msg_ready_now,_) => {

                // avoid duplicated calls
                if(is_ready_now) return
                is_ready_now = true
                // console.log("[remove] db_read")

                // clean up
                msg_stack.push(msg_ready_now)
                clean_stack()

                // read DB
                db_read('wallets', ()=>{

                    // User really got wallet ?
                    if(db.wallets.find(i => i.username === username)){
                        // console.log("[remove] pool query")
                        pool.query("DELETE FROM wallets WHERE username = $1", [username], (err, res)=>{
                            if(err) console.error(err)
                            else { // successfully
                                
                                // feedback
                                bot.sendMessage(root, 
                                `Your wallet is deleted. /create to make a new one.`)
                                .then(msg_deleted => msg_stack.push(msg_deleted))
                            }
                        })
                    } else { // wallet not found
                        bot.sendMessage(root, 
                        `Your wallet is not found. /create to make a new one.`)
                        .then(msg_not_found => msg_stack.push(msg_not_found))
                    }
                })
            })
            bot.onText(/No, still using it/, (msg_answer_no,_) => {
                msg_stack.push(msg_answer_no)
                bot.sendMessage(root, `Alright, have fun.`)
                .then(msg_decided_no => clean_msg(msg_decided_no, DURATION_5SECS))
            })
        })
})


// *EXPORT
bot.onText(/\/export/, (msg_export_mnemonic,_)=>{
    // private only
    if(msg_export_mnemonic.chat.type != 'private') return

    // require username
    const username = get_cap_username(msg_export_mnemonic)
    if(!username) return
    
    // read DB
    db_read('wallets', ()=>{

        // Has wallet yet ?
        const account = db.wallets.find(item => item.username === username)
        if(account){

            // get chat id
            let root_chat_id = msg_export_mnemonic.chat.id
            let mid = msg_export_mnemonic.from.id
            clean_msg(msg_export_mnemonic)

            // inline question
            bot.sendMessage(root_chat_id, 
                `You have 5 seconds to copy this message before it's removed. Ready ?`,
                {"reply_markup" : {"keyboard" : [["I'm ready"]],"one_time_keyboard": true
                }}).then( msg_ready_await => {       
                
                // clean up
                msg_stack.push(msg_ready_await)

                // make it run once
                let is_ready_now = false

                bot.onText(/I'm ready/, (msg_ready_now,_) => {

                    // avoid duplicated calls
                    if(is_ready_now) return
                    is_ready_now = true
                    
                    // clean up
                    msg_stack.push(msg_ready_now)
                    clean_stack()


                    try {
                        let secret = null 

                        // account is encrypted
                        if(account.is_locked){
                            console.log(`[export] request IMP for locked account`)

                            // request password from IMP
                            secret = get_secret_from_season(account, msg_export_mnemonic)
                        } 
                        else {
                            // decrypt mnemonic
                            secret = decrypt_secret(account, mid)
                        }
                        if(secret != null){
                            // Show mnemonic
                            bot.sendMessage(root_chat_id, rep_mnemonic(secret), {parse_mode:'HTML'})
                                .then(msg_secret=>clean_after(msg_secret, DURATION_5SECS, true))
                        }
                    } catch { // account mismatched
                        bot.sendMessage(root_chat_id, rep_mnemonic_mismatched())
                            .then(msg_mismatch => msg_stack.push(msg_mismatch))
                    }
                })
            }) 
        } else { // no wallet yet.
            no_wallet_feedback(msg_export_mnemonic, 'You')
        }
    })
})

const rep_mnemonic = (secret) => `<b>Mnemonic</b> \n\n<code>${secret}</code>\n`
const rep_mnemonic_mismatched = () => `your account info were mismatched to last access.`

const rep_cant_setup_lock = () => `Can't setup lock.`
//
// PERMISSIONED TASKS
//
let is_admin = (msg) => {
    return db.admins.find(item => item.username === msg.from.username.toUpperCase()) ? true : false
}

// RPC LIST
bot.onText(/\/rpc_list/, (msg) => {
    let val = toolkit.rpc.getRpcUrl()
    let acc = `<strong>RPC\n${val}</strong>\n\n<b>LIST</b>\n<code>`
    Object.keys(tezallet.RPC_URL).map(rpc => acc += rpc.toString() + "\n")
    acc += "\n</code>"
    bot.sendMessage(msg.chat.id, acc, {parse_mode:"HTML"})
    .then(sent => msg_stack.push(sent))
})

// CHANGE RPC
bot.onText(/\/rpc (.+)/, (msg, match) => {
    
    // fetch DB
    db_read('admins', () => {
    
    // permissioned
    if(!is_admin) return
    
    // init
    const custom = match[1].toString()
    let new_rpc = tezallet.RPC_URL[custom]
    let new_rpc_url = ""
    let new_toolkit = null

    // matching type of rpc
    if(new_rpc){
        new_toolkit = tezallet.init_tezos_toolkit(new_rpc)
        new_rpc_url = new_toolkit.rpc.getRpcUrl()
    } else {
        new_toolkit = tezallet.init_tezos_toolkit(null, custom)
        new_rpc_url = new_toolkit.rpc.getRpcUrl()
    }
    // save to current instance
    toolkit = new_toolkit

    // feedback
    bot.sendMessage(msg.chat.id, `changed RPC into ${new_rpc_url}`)
    .then(sent => msg_stack.push(sent))
    })
})

// CLEANUP TIME
bot.onText(/\/clean_time ([0-9]+)/, (msg, match)=> {
    db_read('admins', () => {
        if(!is_admin) return
        let given = Number.parseInt(match[1].toString())
        if(given > 10) {
            cleanup_duration = given * 1000
            bot.sendMessage(msg.chat.id, `set clean up time to ${given} secs`)
        } else {
            bot.sendMessage(msg.chat.id, `cleanup time can't be shorter than 10 seconds (current ${cleanup_duration/1000} given ${given})`)
        }
    })
})

// +ADMIN_ASSIGN
bot.onText(/\/admin_add @(.+)/, (msg, match) => {
    db_read('admins', () => {
        if(!is_admin(msg)) { // Permission filtering:
            bot.sendMessage(msg.chat.id, "You don't have permission, mortal !")
            return
        }
        let new_admin = match[1].toUpperCase()
        let existed = db.admins.find(i => i.username === new_admin)
        if(existed){
            if(new_admin!=ROOT){ // ROOT is immutable !
                pool.query("DELETE FROM admins WHERE username = $1", [new_admin], (err, _)=>{
                    bot.sendMessage(msg.chat.id, `- removed [${new_admin}] as admin\n${err ? err.message:''}`)
                })
            }
        } else {
            pool.query("INSERT INTO admins VALUES ($1)", [new_admin], (err, _)=>{
                bot.sendMessage(msg.chat.id, `+ added [${new_admin}] as admin\n${err ? err.message:''}`)
            })
        }
    })
})

// +GROUP_SUB
bot.onText(/\/group_sub/, (msg) => {
    if(msg.chat.type === 'private') return;
    const chatId = msg.chat.id.toString() // number
    const title = msg.chat.title // string
    // db
    db_read('admins', ()=>{
        if(!is_admin(msg)) {
            console.log("[group_sub] you don't have permission.")
            return
        }
        db_read('groups', ()=>{
            if(!db.groups.find(item => item.id === chatId)){   // string
                pool.query("INSERT INTO groups (id, title) VALUES ($1,$2)", 
                    [chatId, title], (err, _)=>{
                    bot.sendMessage(msg.chat.id,
                    `+ added <code>${title}</code> ${err ? err.message:''}`, 
                    {parse_mode : "HTML"}).then(msg_added => clean_after(msg_added, DURATION_5SECS))
                })
            } else {
                pool.query("DELETE FROM groups WHERE id = $1", [chatId], (err, _)=> {
                    bot.sendMessage(msg.chat.id,  
                    `<i>removed [${title}]</i> ${err ? err.message:''}`, 
                    {parse_mode : "HTML"}).then(msg_rm => clean_after(msg_rm, DURATION_5SECS))
                })
            }
        })
    })
})

// *GROUP_LIST
bot.onText(/\/group_list/, (msg) => {
    // reading data ..
    db_read('groups', () => {
        //
        const Id = msg.chat.id
        let groups = db.groups
        if(groups.length > 0){
            let message = "<code>Subscribes:\n"
            for(let i = 0; i < groups.length; i++){
                message += `${i+1}. ${groups[i].title}\n` 
            }
            bot.sendMessage(Id, message + "</code>", {parse_mode : "HTML"})
            .then(msg_sub => clean_after(msg_sub, DURATION_5SECS))
        } else {
            bot.sendMessage(Id, "no groups added yet.")
            .then(msg_empty => clean_after(msg_empty, DURATION_5SECS))
        }
    })
})

// -GROUP_RESET
bot.onText(/\/group_reset/, (msg) => {
    const id = msg.chat.id
    db_read('admins', () => {
        if(!is_admin(msg)) {
            console.log("[group_reset] you don't have permission.")
            return
        }
        db_read('groups', ()=>{
            if(db.groups){
                pool.query("DELETE FROM groups;", (err, _)=>{
                    bot.sendMessage(id, `[group_reset] ${err ? err.message :'done'}.`)
                    .then(msg_delete => clean_after(msg_delete, DURATION_5SECS))
                })
            } else {
                bot.sendMessage(id, "no group yet.")
                .then(msg_empty => clean_after(msg_empty, DURATION_5SECS))
            }
        })
    })
})

// -DB RESET
bot.onText(/\/reset_db/, (msg) => {
    const id = msg.chat.id
    db_read('admins', ()=>{
        // permission
        if(!is_admin(msg)) {
            console.log("[reset_db] you don't have permission.")
            .then(msg_per => clean_after(msg_per, DURATION_5SECS))
            return
        }
        // QUERY
        pool.query("DROP TABLE IF EXISTS groups,admins,wallets;", (err, _)=>{
            db = {}
            console.log(`[reset_db] done.\n${err ? err.message : ''}`)
            bot.sendMessage(id, `[db] ${err ? err.message : 'reset completed'}.`)
            .then(msg_done => clean_after(msg_done, DURATION_5SECS))
            // re-init
            db_init()
        })
    })
})
