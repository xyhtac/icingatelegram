![Interactive Telegram bot as Icinga monitoring frontend](/img/bot_interface.jpg?raw=true "icingatelegram - TG monitoring front-end")


[![icingatelegram-1.0](https://img.shields.io/badge/dev-icingatelegram_1.0-7a00b9)](https://github.com/xyhtac/icingatelegram/releases/tag/v.1.0)

### Problem.
The icingaweb front-end is powerful, but not exactly user-friendly. In our quest for a simpler solution, we explored various approaches to deliver system statuses seamlessly to both web and mobile applications, but we always stumbled over access management. Our customers weren’t thrilled to install yet another app and remember additional login details just to check if everything is running smoothly. So, we wanted a bridge between mobile devices and our monitoring data that didn’t involve app installations and password juggling.


### Notifications with Telegram Groups.
Icinga notifications to the Telegram have always worked well because of the popularity of the messenger. There are a variaty of scripts for sending messages out there, you may pick a solution of your choice. I prefer minimalistic bash script by [], it is also included in this package with minor modifications. Put files to your icinga master:
```
conf.d/telegram-notifications.conf > /etc/icinga2/conf.d/
scripts/telegram-host-notification.sh > /etc/icinga2/scripts/
scripts/telegram-service-notification.sh > /etc/icinga2/scripts/
```
Next, go to BotFather[], set new bot name and description, grab a bot token. When attaching notification groups, opt for the Telegram supergroup IDs instead of individual user IDs. By associating notifications with the supergroup IDs, you are shifting access management from icinga configurations to the visually intuitive process of Telegram group administration, so you can perform user control tasks outside of your DevOps access scope. Go to your Telegram web or app, create new group, go to group settings, click on *add user*, find your new bot and check it. Now write something to your group and check if bot is actually getting updates:
```
https://api.telegram.org/[TELEGRAM_BOT_TOKEN]/getUpdates
```
Find your message in the update list and copy ID of the supergroup. Now, edit `telegram-notifications.conf` and replace `TELEGRAM_BOT_TOKEN` with your bot token and `TELEGRAM_GROUP_ID` with the ID of your supergroup.


### Interactive requests.
After completing these steps, you’ve successfully established a solid foundation for an interactive monitoring front-end based on Telegram. The next step involves updating our notifications bot to make it interactive. Icingatelegram connects with the Telegram API, acting as a webhook server, and interfaces with your icinga API to fetch monitoring data. 

The bot interacts with your users directly through private chats. However, to initiate a conversation, users must first send a */sitrep* request from the corresponding group to which they belong. The underlying assumption is that all group members have access to a specific set of icinga services that you define in your configuration file. The group ID obtained from the initial request is utilized by the bot to determine the available dataset for the user and generate a session token. Now you can focus on delivering specific monitoring data to specific group ID on request and the Telegram will take care of the access control.


### Installation.


### Configuration file.
```
"request": {
    "api-key": "",
    "application-id": "",
    "description": ""
}
```
```
"response": {
    "path": "",
    "port": "",
    "url": "",
    "updated": "",
    "ssl_certificate": "",
    "ssl_key": "",
    "docker_container_name": "",
    "docker_image_name": ""
}
```

### License
`icingatelegram` is licensed under the [MIT](https://www.mit-license.org/) license for all open source applications.

### Bugs and feature requests

Please report bugs [here on Github](https://github.com/xyhtac/icingatelegram/issues).
Guidelines for bug reports:
1. Use the GitHub issue search — check if the issue has already been reported.
2. Check if the issue has been fixed — try to reproduce it using the latest master or development branch in the repository.
3. Isolate the problem — create a reduced test case and a live example. 

A good bug report shouldn't leave others needing to chase you up for more information.
Please try to be as detailed as possible in your report.
Feature requests are welcome. Please look for existing ones and use GitHub's "reactions" feature to vote.
