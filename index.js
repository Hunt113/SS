// 1. Load the environment variables first thing!
require('dotenv').config(); 

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, AuditLogEvent, ActivityType } = require('discord.js');
const express = require('express');
const axios = require('axios');

// --- CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1508833085641330820'; 

// Logging and Permissions Configurations
const LOG_CHANNEL_ID = "1500980048847438004"; // Your requested log channel
const CHECK_REQUIRED_ROLE = "〆│ STAFF";
const ROLE_REQUIRED_ROLE = "〆│ Ranker";
const PROMOTION_REQUIRED_ROLE = "--HC--"; // Role allowed to use the /promotion command

const TARGET_SHIRTS = {
    "126872339221292": "Killa Rat Access 🔪",
    "85168238681351": "Hitman Rat Access 🕵🏻",
    "89867158739557": "Trooper Rat Access 🪖",
    "127226434834751": "VIP Rat Access ⭐",
    "130135917423968": "Transfer Access"
};
// ---------------------

// Setting up the Express server so Render stays awake
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration // Required to receive audit log entries
    ] 
});

// Register Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Checks if a Roblox user owns specific access shirts')
        .addStringOption(option => option.setName('username').setDescription('The Roblox username to check').setRequired(true)),
    new SlashCommandBuilder()
        .setName('role')
        .setDescription('Give a role to a server member')
        .addUserOption(option => option.setName('user').setDescription('The member to give the role to').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('The role to give').setRequired(true)),
    new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a role from a server member')
        .addUserOption(option => option.setName('user').setDescription('The member to remove the role from').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('The role to remove').setRequired(true)),
    new SlashCommandBuilder()
        .setName('promotion')
        .setDescription('Announce a staff member promotion')
        .addUserOption(option => option.setName('user').setDescription('The staff member being promoted').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('The new role they are receiving').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for the promotion').setRequired(false))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

// Helper function for role rules security
function validateRoleAction(interaction, member, rankerRole, targetUser, targetRole) {
    const isRankerOrHigher = member.roles.cache.some(r => r.position >= rankerRole.position);
    if (!isRankerOrHigher) {
        interaction.reply({ content: `❌ This command is restricted to **${ROLE_REQUIRED_ROLE}** and higher roles.`, ephemeral: true });
        return false;
    }
    if (!targetUser) {
        interaction.reply({ content: `❌ That user is not in this server.`, ephemeral: true });
        return false;
    }
    if (targetUser.roles.highest.position >= rankerRole.position) {
        interaction.reply({ content: `❌ You cannot modify roles for someone who is equal to or higher than the **${ROLE_REQUIRED_ROLE}** level!`, ephemeral: true });
        return false;
    }
    if (targetRole.position >= rankerRole.position) {
        interaction.reply({ content: `❌ Strict Protection: You cannot assign or remove a role that is equal to or higher than the **${ROLE_REQUIRED_ROLE}** role!`, ephemeral: true });
        return false;
    }
    const botMember = interaction.guild.members.me;
    if (targetRole.position >= botMember.roles.highest.position) {
        interaction.reply({ content: `❌ I cannot manage that role because it is positioned higher than my bot role.`, ephemeral: true });
        return false;
    }
    return true; 
}

// Handle Slash Command Interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const member = interaction.member;

    if (interaction.commandName === 'check') {
        const staffRole = interaction.guild.roles.cache.find(r => r.name === CHECK_REQUIRED_ROLE);
        if (!staffRole) return interaction.reply({ content: `⚠️ System Error: Role **${CHECK_REQUIRED_ROLE}** not found.`, ephemeral: true });

        const isStaffOrHigher = member.roles.cache.some(r => r.position >= staffRole.position);
        if (!isStaffOrHigher) return interaction.reply({ content: `❌ This command is restricted to **${CHECK_REQUIRED_ROLE}** and higher.`, ephemeral: true });

        const robloxUsername = interaction.options.getString('username');
        await interaction.deferReply(); 

        try {
            const userResponse = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [robloxUsername], excludeBannedUsers: true });
            if (!userResponse.data.data || userResponse.data.data.length === 0) return interaction.editReply(`❌ Could not find a Roblox user named **${robloxUsername}**.`);

            const robloxId = userResponse.data.data[0].id;
            const actualName = userResponse.data.data[0].displayName;
            let ownedShirtsOutput = [];

            for (const shirtId of Object.keys(TARGET_SHIRTS)) {
                try {
                    const ownershipResponse = await axios.get(`https://inventory.roblox.com/v1/users/${robloxId}/items/Asset/${shirtId}`);
                    if (ownershipResponse.data.data && ownershipResponse.data.data.length > 0) ownedShirtsOutput.push(`${TARGET_SHIRTS[shirtId]}`);
                } catch (err) {
                    if (err.response && err.response.status === 403) return interaction.editReply(`🔒 **${actualName}** has their inventory set to private.`);
                }
            }

            const embed = new EmbedBuilder().setTitle(`Inventory Check: ${actualName}`).setURL(`https://www.roblox.com/users/${robloxId}/profile`).setTimestamp();
            if (ownedShirtsOutput.length > 0) {
                embed.setColor(0x00FF00).setDescription(`✅ **Match Found!** This user has the following roles:`).addFields({ name: 'Owned Access', value: ownedShirtsOutput.join('\n') });
            } else {
                embed.setColor(0xFF0000).setDescription(`❌ **No Match.** This user does not own any of the required access shirts.`);
            }
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply('⚠️ An error occurred while processing your request.');
        }
    }

    if (interaction.commandName === 'role') {
        const rankerRole = interaction.guild.roles.cache.find(r => r.name === ROLE_REQUIRED_ROLE);
        if (!rankerRole) return interaction.reply({ content: `⚠️ System Error: Role **${ROLE_REQUIRED_ROLE}** not found.`, ephemeral: true });

        const targetUser = interaction.options.getMember('user');
        const targetRole = interaction.options.getRole('role');
        if (!validateRoleAction(interaction, member, rankerRole, targetUser, targetRole)) return;

        try {
            if (targetUser.roles.cache.has(targetRole.id)) return interaction.reply({ content: `⚠️ **${targetUser.user.username}** already has the role **${targetRole.name}**.`, ephemeral: true });
            await targetUser.roles.add(targetRole);
            return interaction.reply({ content: `✅ Successfully gave the role **${targetRole.name}** to **${targetUser.user.username}**.` });
        } catch (error) {
            return interaction.reply({ content: `⚠️ Failed to add role.`, ephemeral: true });
        }
    }

    if (interaction.commandName === 'remove') {
        const rankerRole = interaction.guild.roles.cache.find(r => r.name === ROLE_REQUIRED_ROLE);
        if (!rankerRole) return interaction.reply({ content: `⚠️ System Error: Role **${ROLE_REQUIRED_ROLE}** not found.`, ephemeral: true });

        const targetUser = interaction.options.getMember('user');
        const targetRole = interaction.options.getRole('role');
        if (!validateRoleAction(interaction, member, rankerRole, targetUser, targetRole)) return;

        try {
            if (!targetUser.roles.cache.has(targetRole.id)) return interaction.reply({ content: `⚠️ **${targetUser.user.username}** does not have the role **${targetRole.name}** to remove.`, ephemeral: true });
            await targetUser.roles.remove(targetRole);
            return interaction.reply({ content: `✅ Successfully removed the role **${targetRole.name}** from **${targetUser.user.username}**.` });
        } catch (error) {
            return interaction.reply({ content: `⚠️ Failed to remove role.`, ephemeral: true });
        }
    }

    if (interaction.commandName === 'promotion') {
        const hcRole = interaction.guild.roles.cache.find(r => r.name === PROMOTION_REQUIRED_ROLE);
        if (!hcRole) return interaction.reply({ content: `⚠️ System Error: Role **${PROMOTION_REQUIRED_ROLE}** not found.`, ephemeral: true });

        // Rule 1: Command executor must have the HC role or higher
        const isHCOrHigher = member.roles.cache.some(r => r.position >= hcRole.position);
        if (!isHCOrHigher) return interaction.reply({ content: `❌ This command is restricted to **${PROMOTION_REQUIRED_ROLE}** and higher.`, ephemeral: true });

        const targetUser = interaction.options.getMember('user');
        const targetRole = interaction.options.getRole('role');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!targetUser) return interaction.reply({ content: `❌ That user is not in this server.`, ephemeral: true });

        // Rule 2: Cannot use the command on someone with an equal or higher role than the executor
        if (targetUser.roles.highest.position >= member.roles.highest.position) {
            return interaction.reply({ content: `❌ Strict Protection: You cannot promote someone who has an equal or higher role than you!`, ephemeral: true });
        }

        // Rule 3: Cannot assign a role that is equal to or higher than the executor's own highest role
        if (targetRole.position >= member.roles.highest.position) {
            return interaction.reply({ content: `❌ Strict Protection: You cannot assign a role that is equal to or higher than your own highest role!`, ephemeral: true });
        }

        // Rule 4: Bot hierarchy check
        const botMember = interaction.guild.members.me;
        if (targetRole.position >= botMember.roles.highest.position) {
            return interaction.reply({ content: `❌ I cannot manage that role because it is positioned higher than my bot role.`, ephemeral: true });
        }

        try {
            // Add the new role to the member
            await targetUser.roles.add(targetRole);

            // Create the custom visual layout matching your confirmation photo template
            const promoEmbed = new EmbedBuilder()
                .setTitle('Staff Promotion')
                .setColor(0x2ECC71) // Solid green bar layout matching your photo frame
                .setDescription(
                    `🌟 **New Promotion Announced!**\n\n` +
                    `*"Every rank earned is a reflection of the effort and dedication you pour into this community. Keep climbing — the top is just the beginning."*\n\n` +
                    `👤 **Promoted**\n<@${targetUser.id}>\n\n` +
                    `🏆 **New Role**\n<@&${targetRole.id}>\n\n` +
                    `📋 **Reason**\n${reason}\n\n` +
                    `✅ **Promoted By**\n<@${interaction.user.id}>\n\n` +
                    `📅 **Date**\n${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                )
                .setFooter({ text: `Congratulations, ${targetUser.user.username}! You've earned it. 🔥` });

            // Send standard public notification alongside the visual container
            return interaction.reply({ 
                content: `🐀 <@${targetUser.id}> just got promoted! The grind pays off. 💚`, 
                embeds: [promoEmbed] 
            });

        } catch (error) {
            console.error(error);
            return interaction.reply({ content: `⚠️ Failed to complete promotion sequence. Make sure my bot role is placed above the target role.`, ephemeral: true });
        }
    }
});

// Universal Audit Log Listener
client.on('guildAuditLogEntryCreate', async (auditLogEntry, guild) => {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return; 

    const { action, executorId, targetId, changes } = auditLogEntry;
    
    const executor = client.users.cache.get(executorId) || await client.users.fetch(executorId).catch(() => null);
    const executorTag = executor ? `${executor.username}` : `Unknown (${executorId})`;
    
    let actionTitle = "⚙️ Audit Log Activity";
    let dynamicFieldName = "Target Info";
    let dynamicFieldValue = `ID: ${targetId}`;

    if (action === AuditLogEvent.MemberRoleUpdate) {
        actionTitle = "⚠️ Role Modified on Member";
        dynamicFieldName = "Member";
        dynamicFieldValue = `<@${targetId}>`;
    } else if (action === AuditLogEvent.MemberKick) {
        actionTitle = "👢 Member Kicked From Guild";
        dynamicFieldName = "Kicked Target";
        dynamicFieldValue = `<@${targetId}>`;
    } else if (action === AuditLogEvent.MemberBanAdd) {
        actionTitle = "🔨 Member Banned From Guild";
        dynamicFieldName = "Banned Target";
        dynamicFieldValue = `<@${targetId}>`;
    } else if (action === AuditLogEvent.ChannelCreate) {
        actionTitle = "📁 Channel Created";
        dynamicFieldName = "Channel";
        dynamicFieldValue = `<#${targetId}>`;
    } else if (action === AuditLogEvent.ChannelDelete) {
        actionTitle = "🗑️ Channel Deleted";
        dynamicFieldName = "Channel Name Reference";
    }

    const logEmbed = new EmbedBuilder()
        .setTitle(actionTitle)
        .setColor(0xFF0000) 
        .addFields({ name: dynamicFieldName, value: dynamicFieldValue, inline: true })
        .setFooter({ text: `Member: ${executorTag} • By: ${executorTag} • ${new Date().toLocaleString()}` });

    if (changes && changes.length > 0) {
        let updateDetails = [];
        for (const change of changes) {
            if (change.key === '$add') {
                updateDetails.push(`**Role(s) Added:** <@&${change.new[0].id}>`);
            } else if (change.key === '$remove') {
                updateDetails.push(`**Role(s) Removed:** <@&${change.new[0].id}>`);
            } else {
                updateDetails.push(`**${change.key}:** \`${change.old || 'None'}\` ➔ \`${change.new || 'None'}\``);
            }
        }
        
        if (updateDetails.length > 0) {
            logEmbed.addFields({ name: "Activity Details", value: updateDetails.join('\n'), inline: false });
        }
    }

    logEmbed.addFields({ name: "Added by / Executed by", value: `<@${executorId}>`, inline: true });

    await logChannel.send({ embeds: [logEmbed] }).catch(err => console.error("Failed to send log message:", err));
});

// Set up status and print online message
client.on('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    
    // Sets custom status activity: "Playing Sewer Soldier On Top"
    client.user.setActivity('Sewer Soldier On Top', { type: ActivityType.Playing });
});

// Safe Cloud Authentication Entry Point
client.login(TOKEN);
