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
// const fs = require('fs');

// link fetch for external api access
const fetch = require('node-fetch');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// load configurations
// binary switch - log non-error information to console
const verbose = config.get('defaults.verbose');

// binary switch - enable return button
const returnButtonEnabled = config.get('defaults.return-button');

// load monitoring configuration object
const monitoring = config.get('monitoring');

// load interface from configuration
const ifString = config.get('interface');

// set default language
const defaultLang = config.get('defaults.defaultLang');

// initiate node.telebot
const bot = new TeleBot({
    token: config.get('telegram.token'),    // Required. Telegram Bot API token.
    webhook: {                              // Optional. Use webhook instead of polling.
        key: config.get('telegram.key'),    // Optional. Private key for server.
        cert: config.get('telegram.cert'),  // Optional. Public key.
        url: config.get('telegram.url'),    // HTTPS url to send updates to.
        host: config.get('telegram.host'),  // Webhook server host.
		port: config.get('telegram.port'),  // Server port.
        maxConnections: config.get('telegram.maxConnections') // Optional. Maximum allowed number of simultaneous HTTPS connections to the webhook for update delivery
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

    // send confirmation to the initial group
    messagePublic = ifString["public_confirm"][ defaultLang ].replace(/USERNAME/g, callName );
    bot.sendMessage( chatId, messagePublic, {replyToMessage, parseMode});

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

    if (returnButtonEnabled) { 
        let returnButton = bot.inlineButton( ifString["button_return"][ defaultLang ], { callback: '/tellme_' + sessionId } );
        buttons.push( [ returnButton ] );
        replyMarkup = bot.inlineKeyboard( buttons, { once: true } );
    }

    try {
        let monitoringData = await getCheckResult( serviceCode );
        message = ifString["text_report_header"][ defaultLang ];
        message = message.replace(/CHATTITLE/g, chatTitle );
        message = message.replace(/SERVICELABEL/g, serviceLabel );
        message = message.replace(/REPORT/g, monitoringData );

    } catch (e) {
        if (verbose) { console.log(e) };
        message = ifString["request_failed"][ defaultLang ];
    }

    return bot.sendMessage( msg.from.id, message, { replyMarkup, parseMode} ).then (re => {
		// set update message trail
		lastMessage[sessionId] = [ msg.from.id, re.message_id ];
	});
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