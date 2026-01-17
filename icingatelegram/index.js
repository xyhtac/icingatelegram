#!/usr/bin/node

// Max.Fischer (c) 2024 - Licensed under M.I.T.
// https://github.com/xyhtac/icingatelegram
// icingatelegram > index.js


// initiate TG bot framework
const TeleBot = require('telebot');

// configure service
const config = require('config');

// link string encode library
const base64 = require('base-64');

// link crypto library
const crypto = require('crypto');

// link filesystem access library
const fse = require('fs-extra');

// link crypto library for readin pem certs
const { X509Certificate } = require('crypto');

// link fetch for external api access
const fetch = require('node-fetch');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// load configurations
// binary switch - enable return button
const returnButtonEnabled = config.get('defaults.return-button');

// binary switch - enable group confirmation message
const confirmationEnabled = config.get('defaults.confirmation');

// load project configuration object
const project = config.get('defaults.project');

// load monitoring configuration object
// const monitoring = config.get('monitoring');

// load interface from configuration
const ifString = config.get('interface');

// set default language
const defaultLang = config.get('defaults.defaultLang');

// set TG message size limit
const messageLimit = config.get('telegram.maxMessageSize');

// set TG message size limit
const messageDelay = config.get('telegram.messageDelay');


// Load configuration from environment variables
const ENV_HOST_NAME     = getEnv('HOST_NAME', { required: false, type: 'hostname' });                           // Fully-qualified domain name for webhook
const BOT_TOKEN         = getEnv('BOT_TOKEN', { required: true, type: 'string' });                              // Telegram Bot Secret
const HOST_PORT         = getEnv('HOST_PORT', { required: false, type: 'number', default: '443' });             // Externally available web proxy port
const SWARM_PATH        = getEnv('SWARM_PATH', { required: false, type: 'string', default: project.name });     // Swarm-derived path for the service api
const SWARM_PORT        = getEnv('SWARM_PORT', { required: false, type: 'number', default: HOST_PORT });        // Swarm derived service port
const VERBOSE           = getEnv('VERBOSE', { required: false, type: 'boolean', default: false });              // Console verbosity mode
const SSL_KEY           = getEnv('SSL_KEY', { required: false, type: 'file', default: '/app/certs/ssl.key' });  // SSL Key local filename with fallback
const SSL_CERT          = getEnv('SSL_CERT', { required: false, type: 'file', default: '/app/certs/ssl.pem' }); // SSL Certificate local filename with fallback
const ICINGA_API        = getEnv('ICINGA_API', { required: false, type: 'string' });                            // Icinga API endpoint URL
const ICINGA_USER       = getEnv('ICINGA_USER', { required: true, type: 'string' });                            // Icinga API username
const ICINGA_PASS       = getEnv('ICINGA_PASS', { required: true, type: 'string' });                            // Icinga API secret

let pemFqdn = null;
// Try to extract FQDN from certificate
try {
    pemFqdn = extractFQDNFromPem(SSL_CERT);
} catch (err) {
    console.warn('[INIT] Certificate read error:', err.message);
}
// Resolve final hostname
let HOST_NAME;
if (ENV_HOST_NAME) {
    HOST_NAME = ENV_HOST_NAME;
    console.log('[INIT] Hostname overridden by ENV HOST_NAME:', HOST_NAME);
} else if (pemFqdn) {
    HOST_NAME = pemFqdn;
    console.log('[INIT] Hostname resolved from certificate:', HOST_NAME);
} else {
    console.error('[FATAL] Hostname not provided and not found in certificate');
    process.exit(1);
}


const telegram = {
    ...config.get('telegram'),
    token: BOT_TOKEN || config.get('telegram.token'),
    key: SSL_KEY || config.get('telegram.key'),
    cert: SSL_CERT || config.get('telegram.cert'),
    url: `https://${HOST_NAME}:${HOST_PORT}/${SWARM_PATH}` || config.get('telegram.url'),
    host: '0.0.0.0' || config.get('telegram.host'),
    port: SWARM_PORT || config.get('telegram.port'),
    maxConnections: config.get('telegram.maxConnections')
}

const monitoring = {
    ...config.get('monitoring'),
    api_url: ICINGA_API || config.get('monitoring.api_url'),
    username: ICINGA_USER || config.get('monitoring.username'),
    password: ICINGA_PASS || config.get('monitoring.password'),
}

console.log ( telegram );

console.log ( monitoring );

// binary switch - log non-error information to console
const verbose = VERBOSE || config.get('defaults.verbose');



// initiate node.telebot
const bot = new TeleBot({
    token: telegram.token, // Required. Telegram Bot API token.
    webhook: {                              // Optional. Use webhook instead of polling.
        // key: config.get('telegram.key'),    // Optional. Private key for server.
        // cert: config.get('telegram.cert'),  // Optional. Public key.
        // url: config.get('telegram.url'),    // HTTPS url to send updates to.
        // host: config.get('telegram.host'),  // Webhook server host.
		// port: config.get('telegram.port'),  // Server port.
        // maxConnections: config.get('telegram.maxConnections') // Optional. Maximum allowed number of simultaneous HTTPS connections to the webhook for update delivery
        key: telegram.key,
        cert: telegram.cert,
        url: telegram.url,
        host: telegram.host,
        port: telegram.port,
        maxConnections: telegram.maxConnections
    },
    allowedUpdates: [], // Optional. List the types of updates you want your bot to receive. Specify an empty list to receive all updates.
    usePlugins: ['askUser', 'commandButton', 'namedButtons'], // Optional. Use user plugins from pluginFolder.
    pluginFolder: '../plugins/' // Optional. Plugin folder location.
    /*
    pluginConfig: { // Optional. Plugin configuration.
        namedButtons: {
            buttons: buttonSet 
        }
    }
    */
});

// define global objects
var lastMessage = {};
var sessionData = {};
let parseMode = 'html';

bot.on('/start', msg => {
    let replyMarkup = {};
    let callName = ''; 

    // Get user name if it's set
    if (msg.from && msg.from.first_name) {
        callName = msg.from.first_name + ',';
    }

    // send hello message to the user
    let message = ifString["welcome_message"][ defaultLang ];
    message = message.replace(/USERNAME/g, callName );

    return bot.sendMessage( msg.from.id, message, {replyMarkup, parseMode});

})

bot.on('/about', msg => {
    let replyMarkup = {};

    // send project about message to the user
    let message = ifString["about_message"][ defaultLang ];
    message = message.replace(/PROJECT/g, project.name );
    message = message.replace(/VERSION/g, project.version );

    return bot.sendMessage( msg.from.id, message, {replyMarkup, parseMode});

})

bot.on('/sitrep', msg => {
    let chatId; let replyToMessage;
    let replyMarkup = {}; let newSessionKey;
    let callName = ''; 

    // get initial request chat Id and thread Id
    if (msg.message) {
        chatId = msg.message.chat.id;
        chatTitle = msg.message.chat.title;
        if (msg.message.reply_to_message) {
            replyToMessage = msg.message.reply_to_message.message_thread_id;
        }
    } else {
        chatId = msg.chat.id;
        chatTitle = msg.chat.title;
        if (msg.reply_to_message) {
            replyToMessage = msg.reply_to_message.message_thread_id;
        }
    }

    // Get user name if it's set
    if (msg.from && msg.from.first_name) {
        callName = msg.from.first_name + ',';
    }

    // if there are configured services for initial chatId, generate sessionData 
    // and proceed, otherwise report and quit.
    if ( monitoring.service[ chatId ] ) {
        newSessionKey = calcOTP(chatId);
        sessionData[newSessionKey] = {
            'origin': chatId,
            'from-group': chatTitle
        }
    } else {
        return bot.sendMessage( chatId, ifString["unknown_chat"][ defaultLang ], {replyToMessage, parseMode} );
    }
    let subscribedServices = monitoring.service[chatId];

    // send confirmation to the initial group if needed
    if (confirmationEnabled) { 
    	messagePublic = ifString["public_confirm"][ defaultLang ].replace(/USERNAME/g, callName );
    	bot.sendMessage( chatId, messagePublic, {replyToMessage, parseMode});
    };

    replyMarkup = bot.inlineKeyboard( generateOptions(subscribedServices, newSessionKey), { once: true } );

    // send request menu message to the private chat
    let message = ifString["select_service"][ defaultLang ];
    message = message.replace(/CHATTITLE/g, chatTitle );
    message = message.replace(/USERNAME/g, callName );

    return bot.sendMessage( msg.from.id, message, {replyMarkup, parseMode}).then (re => {
		// set update message trail
		lastMessage[newSessionKey] = [ msg.from.id, re.message_id ];
	});
});

bot.on(/^\/tellme_(.+)/, (msg, props) => { 
    let replyMarkup = {}; 
    let callName = ''; 
    
    let sessionId = props.match[1].replace(/[^0-9a-z]/gm,"");

    if (verbose) { console.log("Session ID: " + sessionId ) };
    if (verbose) { console.log("Full Session Data: " + sessionData ) };
    
    if ( !sessionData[ sessionId ] ) {
        return bot.sendMessage( msg.from.id, ifString["session_expired"][ defaultLang ], {replyMarkup, parseMode} );
    }
    let originId = sessionData[ sessionId ]['origin'];
    let chatTitle = sessionData[ sessionId ]['from-group'];
    let subscribedServices = monitoring.service[originId];

    // Get user name if it's set
    if (msg.from && msg.from.first_name) {
        callName = msg.from.first_name + ',';
    }

    replyMarkup = bot.inlineKeyboard( generateOptions(subscribedServices, sessionId), { once: true } );

    // send request menu message to the private chat
    let message = ifString["select_service"][ defaultLang ];
    message = message.replace(/CHATTITLE/g, chatTitle );
    message = message.replace(/USERNAME/g, callName );

    return bot.sendMessage( msg.from.id, message, {replyMarkup, parseMode}).then (re => {
	// set update message trail
	lastMessage[sessionId] = [ msg.from.id, re.message_id ];
    });

});

bot.on(/^\/render_(.+)_(.+)$/, async (msg, props) => {
    let serverDownload = true; let caption;
    let replyMarkup = {}; let buttons = [];
    
    let sessionId = props.match[1].replace(/[^0-9a-z]/gm,"");
    let serviceId = props.match[2].replace(/[^a-z]/gm,"");
    
    if ( !sessionData[ sessionId ] ) {
        return bot.sendMessage( msg.from.id, ifString["session_expired"][ defaultLang ], {replyMarkup, parseMode} );
    } else if ( !monitoring.service[ sessionData[ sessionId ]['origin'] ][ serviceId ] ) {
        return bot.sendMessage( msg.from.id, ifString["unknown_service"][ defaultLang ], {replyMarkup, parseMode} );
    }
    let originId = sessionData[ sessionId ]['origin'];
    let chatTitle = sessionData[ sessionId ]['from-group'];

    let imageUrl = monitoring.service[ originId ][ serviceId ]['endpoint'];
    let serviceLabel = monitoring.service[ originId ][ serviceId ]['name'][ defaultLang ];

    if (returnButtonEnabled) { 
        let returnButton = bot.inlineButton( ifString["button_return"][ defaultLang ], { callback: '/tellme_' + sessionId } );
        buttons.push( [ returnButton ] );
        replyMarkup = bot.inlineKeyboard( buttons, { once: true } );
    }

    caption = ifString["image_report_caption"][ defaultLang ];
    caption = caption.replace(/CHATTITLE/g, chatTitle );
    caption = caption.replace(/SERVICELABEL/g, serviceLabel );

    return bot.sendPhoto( msg.from.id, imageUrl, {caption, serverDownload, replyMarkup} ).then (re => {
        lastMessage[sessionId] = [ msg.from.id, re.message_id ];
    });

});


bot.on(/^\/report_(.+)_(.+)$/, async (msg, props) => {
    let replyMarkup = {}; let buttons = []; let message;
    
    let sessionId = props.match[1].replace(/[^0-9a-z]/gm,"");
    let serviceId = props.match[2].replace(/[^a-z]/gm,"");

    if ( !sessionData[ sessionId ] ) {
        return bot.sendMessage( msg.from.id, ifString["session_expired"][ defaultLang ], {replyMarkup, parseMode} );
    } else if ( !monitoring.service[ sessionData[ sessionId ]['origin'] ][ serviceId ] ) {
        return bot.sendMessage( msg.from.id, ifString["unknown_service"][ defaultLang ], {replyMarkup, parseMode} );
    }
    let originId = sessionData[ sessionId ]['origin'];
    let chatTitle = sessionData[ sessionId ]['from-group'];

    let serviceCode = monitoring.service[ originId ][ serviceId ]['endpoint'];
    let serviceLabel = monitoring.service[ originId ][ serviceId ]['name'][ defaultLang ];

    let notificationData = [];
    let currentChunk = '';
    try {
        let monitoringData = await getCheckResult( serviceCode );
        if (monitoringData.length > messageLimit) {
            for (const line of monitoringData.split('\n')) {
                if ( ( currentChunk + line + '\n').length >= messageLimit) {
                    notificationData.push(currentChunk);
                    currentChunk = line + '\n';
                } else {
                    currentChunk = currentChunk + line + '\n';
                }
            }
            notificationData.push(currentChunk);
        } else {
            notificationData.push(monitoringData);

        }
    } catch (e) {
        if (verbose) { console.log(e) };
        return bot.sendMessage( msg.from.id, ifString["request_failed"][ defaultLang ], { replyMarkup, parseMode} ).then (re => {
            // set update message trail
            lastMessage[sessionId] = [ msg.from.id, re.message_id ];
        });
    }

    let sendTimeout = 0; let index = 1;
    for (const notification of notificationData) {
        let pageWidget = ''; replyMarkup = {};

        if (notificationData.length > 1) {
            pageWidget = ifString["text_page_widget"][ defaultLang ];
            pageWidget = pageWidget.replace(/PAGE/g, index.toString() );
            pageWidget = pageWidget.replace(/TOTAL/g, notificationData.length.toString() );
	    pageWidget = pageWidget.replace(/CREDITNOTES/g, '' );
        }
        
        if ( index == notificationData.length && returnButtonEnabled) {
            let returnButton = bot.inlineButton( ifString["button_return"][ defaultLang ], { callback: '/tellme_' + sessionId } );
            buttons.push( [ returnButton ] );
            replyMarkup = bot.inlineKeyboard( buttons, { once: true } );
        }
        setTimeout( (notificationConfig) => {
            let message = ifString["text_report_header"][ defaultLang ];
            message = message.replace(/CHATTITLE/g, notificationConfig.chat_title );
            message = message.replace(/SERVICELABEL/g, notificationConfig.service_label );
            message = message.replace(/REPORT/g, notificationConfig.notification );
            message = message.replace(/PAGE/g, notificationConfig.page_widget );
            bot.sendMessage( notificationConfig.userid, message, notificationConfig.msg_config ).then (re => {
                // set update message trail
                lastMessage[notificationConfig.session_id] = [ notificationConfig.userid, re.message_id ];
            });
        }, sendTimeout, {
            'chat_title': chatTitle,
            'service_label': serviceLabel,
            'notification': notification,
            'userid': msg.from.id,
            'msg_config': { replyMarkup, parseMode },
            'session_id': sessionId,
            'page_widget': pageWidget

        });
        sendTimeout = sendTimeout + messageDelay;
        index++;
    }

});

// Button click callback handler
bot.on('callbackQuery', (msg) => {
    if ( verbose ) { console.log('callbackQuery data:', msg.data) };

    // extract sessionId from callback data
    let regexCmdMatch = new RegExp('^\/(tellme|report)_([a-z0-9]+)($|\_)');
    let matchResult = msg.data.match(regexCmdMatch);
    if (matchResult) {
        sessionId = matchResult[2]
    }
    bot.answerCallbackQuery(msg.id);
	if (lastMessage[sessionId]) {
		const [chatId, messageId] = lastMessage[sessionId];
		// Delete trail message
		return bot.deleteMessage(chatId, messageId);
	}
});

function generateOptions( serviceObject, sessionId) {
    let buttons = [];
    let serviceList = Object.keys( serviceObject );
    for ( let serviceCount in serviceList) { 
        if ( serviceList[serviceCount] == "_alias") { continue }
        let currentServiceObject = serviceObject[ serviceList[serviceCount] ];
        if ( currentServiceObject.type == 'image' ) {
            actionPrefix = '/render';
        } else {
            actionPrefix = '/report';
        }
        let serviceButton = bot.inlineButton( currentServiceObject['name'][ defaultLang ], { callback: actionPrefix + "_" + sessionId + "_"+ serviceList[serviceCount] } );
        buttons.push( [ serviceButton ] );
    }
    return buttons;
}

// Get text check result from monitoring API
function getCheckResult( servicePath ) {
    return new Promise(function(resolve, reject) {
        fetch( monitoring.api_url + servicePath, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Basic ' + base64.encode( monitoring.username + ":" + monitoring.password)
            }
        }).then(res => res.json())
        .then(callback => {
            // if (verbose) { console.log(callback) };
            let checkResult = callback.results[0].attrs.last_check_result.output.replace(/[\<\>]/g, '');
            resolve (checkResult);
        }).catch(function() {
            reject ("Could not fetch data");
        });
    });
}

// Generate OTP
function calcOTP ( groupId ) {
	var dpo = new Date();
	curtime = ( dpo.getMonth() + 1 ) + "-" + dpo.getDate() + "-" + dpo.getHours() + "-" + Math.round( dpo.getMinutes() / 5 );
	otpstr = groupId.toString() + "-" + curtime;
	let hashval = crypto.createHash('md5').update( otpstr ).digest("hex");
	return hashval;
}

// start service
bot.start();

// get array of filtered strings from the active bot event list
var botEventList = Array.from( bot.eventList.keys() ).map( (x) => { 
	eventName = x.toString().replace(/[^0-9\wа-яА-ЯёЁ\-\_]/gi, '');
	if (!eventName) { return 0 }
	return eventName;
});
// append event array with valid main keyboard values
// botEventList = botEventList.concat( buttonLabels );




// Helper to parse boolean values
function parseBool(value) {
    if (typeof value === 'string') {
        return ['true', '1', 'yes'].includes(value.toLowerCase());
    }
    return Boolean(value);
}

/**
 * Generic environment variable validator
 * @param {string} name - Env var name
 * @param {Object} options - Validation options
 *   options = {
 *     required: true/false,
 *     type: 'string' | 'number' | 'boolean' | 'file' | 'hostname',
 *     default: defaultValue
 *   }
 */
function getEnv(name, options = {}) {
    let val = process.env[name];

    // Use default if provided
    if ((val === undefined || val === '') && options.default !== undefined) {
        val = options.default;
    }

    // Required check
    if (options.required && (val === undefined || val === '')) {
        console.error(`[FATAL] Required environment variable ${name} is missing`);
        process.exit(1);
    }

    if (!val) return val;

    // Type checks
    switch (options.type) {
        case 'number':
            val = Number(val);
            if (!Number.isInteger(val) || val < 1 || val > 65535) {
                console.error(`[FATAL] ${name} must be a valid port number (1-65535):`, val);
                process.exit(1);
            }
            break;

        case 'file':
            if (!fse.existsSync(val)) {
                console.error(`[FATAL] ${name} file does not exist:`, val);
                process.exit(1);
            }
            break;

        case 'hostname':
            if (!/^[a-zA-Z0-9.-]+$/.test(val)) {
                console.error(`[FATAL] ${name} is not a valid hostname:`, val);
                process.exit(1);
            }
            break;

        case 'boolean':
            val = parseBool(val);
            break;

        case 'string':
        default:
            val = String(val).trim();
            break;
    }

    return val;
}




/**
 * Extract FQDN from a PEM certificate
 * Priority: SAN -> CN
 *
 * @param {string} certPath - Path to PEM certificate
 * @returns {string|null} FQDN or null if not found
 */
function extractFQDNFromPem(certPath) {
    if (!fse.existsSync(certPath)) {
        throw new Error(`Certificate not found: ${certPath}`);
    }

    const pem = fse.readFileSync(certPath);
    const cert = new X509Certificate(pem);

    // Prefer SAN
    if (cert.subjectAltName) {
        const match = cert.subjectAltName.match(/DNS:([^,]+)/);
        if (match) {
            return match[1].trim();
        }
    }

    // Fallback to CN
    const cnMatch = cert.subject.match(/CN=([^,]+)/);
    return cnMatch ? cnMatch[1].trim() : null;
}