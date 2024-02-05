#!/bin/sh

if [[ "$NOTIFICATIONTYPE" == "PROBLEM" ]]; then
	NL=$'\x0D\x0A'
	if [[ "$HOSTSTATE" == "DOWN" ]]; then
		STEMO=$'\xF0\x9F\x98\xB1'
	else
		STEMO=$'\xF0\x9F\x98\xA4'
	fi
elif [[ "$NOTIFICATIONTYPE" == "CUSTOM" ]]; then
	STEMO=$'\xE2\x98\x95'
elif [[ "$NOTIFICATIONTYPE" == "ACKNOWLEDGEMENT" ]]; then
	NL=$'\x0D\x0A'
	STEMO=$'\xF0\x9F\xA4\x90'
elif [[ "$NOTIFICATIONTYPE" == "RECOVERY" ]]; then
	if [[ "$HOSTSTATE" == "UP" ]]; then
		STEMO=$'\xF0\x9F\x98\x81'
	else
		STEMO=$'\xF0\x9F\x98\xA4'
	fi
fi

template=$(cat <<TEMPLATE
$STEMO <strong>$NOTIFICATIONTYPE</strong> - $HOSTDISPLAYNAME is $HOSTSTATE

Host: $HOSTALIAS
Date/Time: $LONGDATETIME
$HOSTLOCATION

<pre>$HOSTOUTPUT</pre>
TEMPLATE
)

if [ -n "$NOTIFICATIONCOMMENT" ]; then
    template="$template
Comment: ($NOTIFICATIONAUTHORNAME) $NOTIFICATIONCOMMENT
"
fi

/usr/bin/curl --silent --output /dev/null \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${template}" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "disable_web_page_preview=true" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"
