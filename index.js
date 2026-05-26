// 1. Load the environment variables first thing!
require('dotenv').config(); 

const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// Setting up the Express server so Render stays awake
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', () => {
    console.log(`${client.user.tag} is online!`);
});

// 2. Log in using the hidden variable instead of a raw string
client.login(process.env.DISCORD_TOKEN);
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, AuditLogEvent } = require('discord.js');
const axios = require('axios');

// --- CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1508833085641330820'; 

// Logging and Permissions Configurations
const LOG_CHANNEL_ID = "1500980048847438004"; // Your requested log channel
const CHECK_REQUIRED_ROLE = "〆│ STAFF";
const ROLE_REQUIRED_ROLE = "〆│ Ranker";

const TARGET_SHIRTS = {
    "126872339221292": "Killa Rat Access 🔪",
    "85168238681351": "Hitman Rat Access 🕵🏻",
    "89867158739557": "Trooper Rat Access 🪖",
    "127226434834751": "VIP Rat Access ⭐",
    "130135917423968": "Transfer Access"
};
// ---------------------

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration // Required to receive audit log entries
    ] 
});

// 1. Register Slash Commands
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
        .addRoleOption(option => option.setName('role').setDescription('The role to remove').setRequired(true))
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

// 2. Handle Slash Command Interactions
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
});

// ========================================================
// 3. UNIVERSAL AUDIT LOG LISTENER (EVERYTHING LOGGED HERE)
// ========================================================
client.on('guildAuditLogEntryCreate', async (auditLogEntry, guild) => {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return; // Channel doesn't exist or isn't cached

    const { action, executorId, targetId, changes } = auditLogEntry;
    
    // Resolve clean execution strings
    const executor = client.users.cache.get(executorId) || await client.users.fetch(executorId).catch(() => null);
    const executorTag = executor ? `${executor.username}` : `Unknown (${executorId})`;
    
    // Human-readable titles depending on what action was triggered inside the server
    let actionTitle = "⚙️ Audit Log Activity";
    let dynamicFieldName = "Target Info";
    let dynamicFieldValue = `ID: ${targetId}`;

    // Clean up title structures based on common categories
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

    // Generate the Dynamic Embed
    const logEmbed = new EmbedBuilder()
        .setTitle(actionTitle)
        .setColor(0xFF0000) // Strictly Red Embed border as requested
        .addFields(
            { name: dynamicFieldName, value: dynamicFieldValue, inline: true }
        )
        .setFooter({ text: `Member: ${executorTag} • By: ${executorTag} • ${new Date().toLocaleString()}` });

    // Format changes details nicely if changes exist (like exact role added or property modified)
    if (changes && changes.length > 0) {
        let updateDetails = [];
        for (const change of changes) {
            if (change.key === '$add') {
                // Roles added
                updateDetails.push(`**Role(s) Added:** <@&${change.new[0].id}>`);
            } else if (change.key === '$remove') {
                // Roles removed
                updateDetails.push(`**Role(s) Removed:** <@&${change.new[0].id}>`);
            } else {
                // Fallback for names, permissions modifications, settings updates, etc.
                updateDetails.push(`**${change.key}:** \`${change.old || 'None'}\` ➔ \`${change.new || 'None'}\``);
            }
        }
        
        if (updateDetails.length > 0) {
            logEmbed.addFields({ name: "Activity Details", value: updateDetails.join('\n'), inline: false });
        }
    }

    // Inject the final execution entity mapping info right into the core layout template form
    logEmbed.addFields({ name: "Added by / Executed by", value: `<@${executorId}>`, inline: true });

    // Send to your designated logs channel
    await logChannel.send({ embeds: [logEmbed] }).catch(err => console.error("Failed to send log message:", err));
});

client.on('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
});
process.env.DISCORD_TOKEN