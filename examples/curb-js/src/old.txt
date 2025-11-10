use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::de::Error as SerdeDeError;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::{app, env};
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{
    LwwRegister, Mergeable as MergeableTrait, UnorderedMap, UnorderedSet, Vector,
};
use types::id;
mod types;
use std::collections::HashMap;
use std::fmt::Write;

id::define!(pub UserId<32, 44>);
type MessageId = String;

const BLOB_ID_SIZE: usize = 32;
const BASE58_ENCODED_MAX_SIZE: usize = 44;

fn encode_blob_id_base58(blob_id_bytes: &[u8; BLOB_ID_SIZE]) -> String {
    let mut buf = [0u8; BASE58_ENCODED_MAX_SIZE];
    let len = bs58::encode(blob_id_bytes).onto(&mut buf[..]).unwrap();
    std::str::from_utf8(&buf[..len]).unwrap().to_owned()
}

fn parse_blob_id_base58(blob_id_str: &str) -> Result<[u8; BLOB_ID_SIZE], String> {
    match bs58::decode(blob_id_str).into_vec() {
        Ok(bytes) if bytes.len() == BLOB_ID_SIZE => {
            let mut blob_id = [0u8; BLOB_ID_SIZE];
            blob_id.copy_from_slice(&bytes);
            Ok(blob_id)
        }
        Ok(bytes) => Err(format!(
            "Invalid blob ID length: expected {} bytes, got {}",
            BLOB_ID_SIZE,
            bytes.len()
        )),
        Err(e) => Err(format!("Failed to decode blob ID '{blob_id_str}': {e}")),
    }
}

fn serialize_blob_id_bytes<S>(
    blob_id_bytes: &[u8; BLOB_ID_SIZE],
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: calimero_sdk::serde::Serializer,
{
    let safe_string = encode_blob_id_base58(blob_id_bytes);
    serializer.serialize_str(&safe_string)
}

fn deserialize_blob_id_bytes<'de, D>(deserializer: D) -> Result<[u8; BLOB_ID_SIZE], D::Error>
where
    D: calimero_sdk::serde::Deserializer<'de>,
{
    let blob_id_str = <String as calimero_sdk::serde::Deserialize>::deserialize(deserializer)?;
    match bs58::decode(&blob_id_str).into_vec() {
        Ok(bytes) if bytes.len() == BLOB_ID_SIZE => {
            let mut blob_id = [0u8; BLOB_ID_SIZE];
            blob_id.copy_from_slice(&bytes);
            Ok(blob_id)
        }
        Ok(bytes) => Err(SerdeDeError::custom(format!(
            "Invalid blob ID length: expected {} bytes, got {}",
            BLOB_ID_SIZE,
            bytes.len()
        ))),
        Err(e) => Err(SerdeDeError::custom(format!(
            "Failed to decode blob ID '{}': {}",
            blob_id_str, e
        ))),
    }
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "calimero_sdk::serde")]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct MessageSentEvent {
    pub message_id: String,
    pub channel: String,
}

#[derive(Debug, Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Attachment {
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    #[serde(
        serialize_with = "serialize_blob_id_bytes",
        deserialize_with = "deserialize_blob_id_bytes"
    )]
    pub blob_id: [u8; BLOB_ID_SIZE],
    pub uploaded_at: u64,
}

impl MergeableTrait for Attachment {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.uploaded_at > self.uploaded_at {
            *self = other.clone();
        }
        Ok(())
    }
}

impl Attachment {
    fn to_public(&self) -> AttachmentPublic {
        AttachmentPublic {
            name: self.name.clone(),
            mime_type: self.mime_type.clone(),
            size: self.size,
            blob_id: encode_blob_id_base58(&self.blob_id),
            uploaded_at: self.uploaded_at,
        }
    }
}

#[derive(Debug, Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct AttachmentPublic {
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub blob_id: String,
    pub uploaded_at: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct AttachmentInput {
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub blob_id_str: String,
}

#[app::event]
pub enum Event {
    ChatInitialized(String),
    ChatJoined(String),
    ChannelCreated(String),
    ChannelInvited(String),
    ChannelLeft(String),
    MessageSent(MessageSentEvent),
    MessageSentThread(MessageSentEvent),
    MessageReceived(String),
    ChannelJoined(String),
    DMCreated(String),
    ReactionUpdated(String),
    NewIdentityUpdated(String),
    InvitationPayloadUpdated(String),
    InvitationAccepted(String),
    DMDeleted(String),
}

#[derive(BorshDeserialize, BorshSerialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct Message {
    pub timestamp: LwwRegister<u64>,
    pub sender: UserId,
    pub sender_username: LwwRegister<String>,
    pub mentions: UnorderedSet<UserId>,
    pub mentions_usernames: Vector<LwwRegister<String>>,
    pub files: Vector<Attachment>,
    pub images: Vector<Attachment>,
    pub id: LwwRegister<MessageId>,
    pub text: LwwRegister<String>,
    pub edited_on: Option<LwwRegister<u64>>,
    pub deleted: Option<LwwRegister<bool>>,
    pub group: LwwRegister<String>,
}

impl MergeableTrait for Message {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        MergeableTrait::merge(&mut self.timestamp, &other.timestamp)?;
        MergeableTrait::merge(&mut self.sender_username, &other.sender_username)?;
        MergeableTrait::merge(&mut self.id, &other.id)?;
        MergeableTrait::merge(&mut self.text, &other.text)?;
        MergeableTrait::merge(&mut self.mentions, &other.mentions)?;
        MergeableTrait::merge(&mut self.mentions_usernames, &other.mentions_usernames)?;
        MergeableTrait::merge(&mut self.files, &other.files)?;
        MergeableTrait::merge(&mut self.images, &other.images)?;
        if let Some(ref b) = other.edited_on {
            if let Some(ref mut a) = self.edited_on {
                MergeableTrait::merge(a, b)?;
            } else {
                self.edited_on = Some(b.clone());
            }
        }
        if let Some(ref b) = other.deleted {
            if let Some(ref mut a) = self.deleted {
                MergeableTrait::merge(a, b)?;
            } else {
                self.deleted = Some(b.clone());
            }
        }
        MergeableTrait::merge(&mut self.group, &other.group)?;
        // sender is immutable identifier, no merge needed
        Ok(())
    }
}

// Manual Clone implementation since UnorderedSet and Vector don't implement Clone
impl Clone for Message {
    fn clone(&self) -> Self {
        Message {
            timestamp: self.timestamp.clone(),
            sender: self.sender,
            sender_username: self.sender_username.clone(),
            mentions: {
                let mut new_set = UnorderedSet::new();
                if let Ok(iter) = self.mentions.iter() {
                    for item in iter {
                        let _ = new_set.insert(item);
                    }
                }
                new_set
            },
            mentions_usernames: {
                let mut new_vec = Vector::new();
                if let Ok(iter) = self.mentions_usernames.iter() {
                    for item in iter {
                        let _ = new_vec.push(item.clone());
                    }
                }
                new_vec
            },
            files: {
                let mut new_vec = Vector::new();
                if let Ok(iter) = self.files.iter() {
                    for attachment in iter {
                        let _ = new_vec.push(attachment.clone());
                    }
                }
                new_vec
            },
            images: {
                let mut new_vec = Vector::new();
                if let Ok(iter) = self.images.iter() {
                    for attachment in iter {
                        let _ = new_vec.push(attachment.clone());
                    }
                }
                new_vec
            },
            id: self.id.clone(),
            text: self.text.clone(),
            edited_on: self.edited_on.clone(),
            deleted: self.deleted.clone(),
            group: self.group.clone(),
        }
    }
}

// Custom Serialize implementation - serialize inner CRDT values for API
impl Serialize for Message {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: calimero_sdk::serde::Serializer,
    {
        use calimero_sdk::serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("Message", 12)?;
        state.serialize_field("timestamp", &*self.timestamp)?;
        state.serialize_field("sender", &self.sender)?;
        state.serialize_field("sender_username", self.sender_username.get())?;

        // Convert UnorderedSet to Vec
        let mentions_vec: Vec<UserId> = if let Ok(iter) = self.mentions.iter() {
            iter.collect()
        } else {
            Vec::new()
        };
        state.serialize_field("mentions", &mentions_vec)?;

        // Convert Vector<LwwRegister<String>> to Vec<String>
        let mentions_usernames_vec: Vec<String> = if let Ok(iter) = self.mentions_usernames.iter() {
            iter.map(|r| r.get().clone()).collect()
        } else {
            Vec::new()
        };
        state.serialize_field("mentions_usernames", &mentions_usernames_vec)?;
        let files_vec = attachments_vector_to_public(&self.files);
        state.serialize_field("files", &files_vec)?;
        let images_vec = attachments_vector_to_public(&self.images);
        state.serialize_field("images", &images_vec)?;

        state.serialize_field("id", self.id.get())?;
        state.serialize_field("text", self.text.get())?;
        state.serialize_field("edited_on", &self.edited_on.as_ref().map(|r| **r))?;
        state.serialize_field("deleted", &self.deleted.as_ref().map(|r| **r))?;
        state.serialize_field("group", self.group.get())?;
        state.end()
    }
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "calimero_sdk::serde")]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct MessageWithReactions {
    pub timestamp: u64,
    pub sender: UserId,
    pub sender_username: String,
    pub mentions: Vec<UserId>,
    pub mentions_usernames: Vec<String>,
    pub files: Vec<AttachmentPublic>,
    pub images: Vec<AttachmentPublic>,
    pub id: MessageId,
    pub text: String,
    pub edited_on: Option<u64>,
    pub reactions: Option<HashMap<String, Vec<String>>>,
    pub deleted: Option<bool>,
    pub thread_count: u32,
    pub thread_last_timestamp: u64,
    pub group: String,
}

fn attachments_vector_to_public(vector: &Vector<Attachment>) -> Vec<AttachmentPublic> {
    let mut attachments = Vec::new();
    if let Ok(iter) = vector.iter() {
        for attachment in iter {
            attachments.push(attachment.to_public());
        }
    }
    attachments
}

fn attachment_inputs_to_vector(
    inputs: Option<Vec<AttachmentInput>>,
    context_id: &[u8; 32],
) -> Result<Vector<Attachment>, String> {
    let mut vector = Vector::new();

    if let Some(attachment_inputs) = inputs {
        for attachment_input in attachment_inputs {
            let blob_id = parse_blob_id_base58(&attachment_input.blob_id_str)?;

            if !env::blob_announce_to_context(&blob_id, context_id) {
                let context_b58 = encode_blob_id_base58(context_id);
                app::log!(
                    "Warning: failed to announce blob {} to context {}",
                    attachment_input.blob_id_str,
                    context_b58
                );
            }

            let attachment = Attachment {
                name: attachment_input.name,
                mime_type: attachment_input.mime_type,
                size: attachment_input.size,
                blob_id,
                uploaded_at: env::time_now(),
            };

            let _ = vector.push(attachment);
        }
    }

    Ok(vector)
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, PartialEq, Eq, Clone)]
#[serde(crate = "calimero_sdk::serde")]
#[borsh(crate = "calimero_sdk::borsh")]
pub enum ChannelType {
    Public,
    Private,
    Default,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct Channel {
    pub name: LwwRegister<String>,
}

impl MergeableTrait for Channel {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        MergeableTrait::merge(&mut self.name, &other.name)?;
        Ok(())
    }
}

// Custom Serialize implementation - serialize the inner value
impl Serialize for Channel {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: calimero_sdk::serde::Serializer,
    {
        use calimero_sdk::serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("Channel", 1)?;
        state.serialize_field("name", self.name.get())?;
        state.end()
    }
}

// Custom Deserialize implementation - wrap in LwwRegister
impl<'de> Deserialize<'de> for Channel {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: calimero_sdk::serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(crate = "calimero_sdk::serde")]
        struct ChannelHelper {
            name: String,
        }

        let helper = ChannelHelper::deserialize(deserializer)?;
        Ok(Channel {
            name: LwwRegister::new(helper.name),
        })
    }
}

impl PartialEq for Channel {
    fn eq(&self, other: &Self) -> bool {
        self.name.get() == other.name.get()
    }
}

impl Eq for Channel {}

impl PartialOrd for Channel {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.name.get().partial_cmp(other.name.get())
    }
}

impl Ord for Channel {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.name.get().cmp(other.name.get())
    }
}

impl std::hash::Hash for Channel {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.name.get().hash(state);
    }
}

impl AsRef<[u8]> for Channel {
    fn as_ref(&self) -> &[u8] {
        self.name.get().as_bytes()
    }
}

#[derive(BorshDeserialize, BorshSerialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct ChannelMetadata {
    pub created_at: LwwRegister<u64>,
    pub created_by: UserId,
    pub created_by_username: Option<LwwRegister<String>>,
    pub read_only: UnorderedSet<UserId>,
    pub moderators: UnorderedSet<UserId>,
    pub links_allowed: LwwRegister<bool>,
}

impl MergeableTrait for ChannelMetadata {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        MergeableTrait::merge(&mut self.created_at, &other.created_at)?;
        MergeableTrait::merge(&mut self.read_only, &other.read_only)?;
        MergeableTrait::merge(&mut self.moderators, &other.moderators)?;
        MergeableTrait::merge(&mut self.links_allowed, &other.links_allowed)?;
        if let (Some(ref mut a), Some(ref b)) =
            (&mut self.created_by_username, &other.created_by_username)
        {
            MergeableTrait::merge(a, b)?;
        } else if other.created_by_username.is_some() {
            self.created_by_username = other.created_by_username.clone();
        }
        // created_by is immutable identifier, no merge needed
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct PublicChannelMetadata {
    pub created_at: u64,
    pub created_by: UserId,
    pub created_by_username: String,
    pub links_allowed: bool,
}

#[derive(BorshDeserialize, BorshSerialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct ChannelInfo {
    pub messages: Vector<Message>,
    pub channel_type: LwwRegister<ChannelType>,
    pub read_only: LwwRegister<bool>,
    pub meta: ChannelMetadata,
    pub last_read: UnorderedMap<UserId, LwwRegister<MessageId>>,
}

impl MergeableTrait for ChannelInfo {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        MergeableTrait::merge(&mut self.messages, &other.messages)?;
        MergeableTrait::merge(&mut self.channel_type, &other.channel_type)?;
        MergeableTrait::merge(&mut self.read_only, &other.read_only)?;
        MergeableTrait::merge(&mut self.meta, &other.meta)?;
        MergeableTrait::merge(&mut self.last_read, &other.last_read)?;
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct FullMessageResponse {
    pub total_count: u32,
    pub messages: Vec<MessageWithReactions>,
    pub start_position: u32,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct PublicChannelInfo {
    pub channel_type: ChannelType,
    pub read_only: bool,
    pub created_at: u64,
    pub created_by_username: String,
    pub created_by: UserId,
    pub links_allowed: bool,
    pub unread_count: u32,
    pub last_read_timestamp: u64,
    pub unread_mention_count: u32,
}

#[derive(BorshDeserialize, BorshSerialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct DMChatInfo {
    pub created_at: LwwRegister<u64>,
    pub context_id: LwwRegister<String>,
    pub channel_type: LwwRegister<ChannelType>,

    // inviter - old chat identity
    pub created_by: UserId,
    // own identity - new dm identity
    pub own_identity_old: UserId,
    pub own_identity: Option<UserId>,
    pub own_username: LwwRegister<String>,

    // other identity - new dm identity
    pub other_identity_old: UserId,
    pub other_identity_new: Option<UserId>,
    pub other_username: LwwRegister<String>,

    pub did_join: LwwRegister<bool>,
    pub invitation_payload: LwwRegister<String>,

    // Hash tracking for new message detection
    pub old_hash: LwwRegister<String>,
    pub new_hash: LwwRegister<String>,

    // Unread message count
    pub unread_messages: LwwRegister<u32>,
}

impl MergeableTrait for DMChatInfo {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        MergeableTrait::merge(&mut self.created_at, &other.created_at)?;
        MergeableTrait::merge(&mut self.context_id, &other.context_id)?;
        MergeableTrait::merge(&mut self.channel_type, &other.channel_type)?;
        MergeableTrait::merge(&mut self.own_username, &other.own_username)?;
        MergeableTrait::merge(&mut self.other_username, &other.other_username)?;
        MergeableTrait::merge(&mut self.did_join, &other.did_join)?;
        MergeableTrait::merge(&mut self.invitation_payload, &other.invitation_payload)?;
        MergeableTrait::merge(&mut self.old_hash, &other.old_hash)?;
        MergeableTrait::merge(&mut self.new_hash, &other.new_hash)?;
        MergeableTrait::merge(&mut self.unread_messages, &other.unread_messages)?;
        // Identity fields are immutable identifiers, no merge needed
        // Option<UserId> fields use LWW - take other if it's Some
        if other.own_identity.is_some() {
            self.own_identity = other.own_identity.clone();
        }
        if other.other_identity_new.is_some() {
            self.other_identity_new = other.other_identity_new.clone();
        }
        Ok(())
    }
}

impl Clone for DMChatInfo {
    fn clone(&self) -> Self {
        DMChatInfo {
            created_at: self.created_at.clone(),
            context_id: self.context_id.clone(),
            channel_type: self.channel_type.clone(),
            created_by: self.created_by,
            own_identity_old: self.own_identity_old,
            own_identity: self.own_identity,
            own_username: self.own_username.clone(),
            other_identity_old: self.other_identity_old,
            other_identity_new: self.other_identity_new,
            other_username: self.other_username.clone(),
            did_join: self.did_join.clone(),
            invitation_payload: self.invitation_payload.clone(),
            old_hash: self.old_hash.clone(),
            new_hash: self.new_hash.clone(),
            unread_messages: self.unread_messages.clone(),
        }
    }
}

// Custom Serialize implementation - serialize inner CRDT values for API
impl Serialize for DMChatInfo {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: calimero_sdk::serde::Serializer,
    {
        use calimero_sdk::serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("DMChatInfo", 14)?;
        state.serialize_field("created_at", &*self.created_at)?;
        state.serialize_field("context_id", self.context_id.get())?;
        state.serialize_field("channel_type", &*self.channel_type)?;
        state.serialize_field("created_by", &self.created_by)?;
        state.serialize_field("own_identity_old", &self.own_identity_old)?;
        state.serialize_field("own_identity", &self.own_identity)?;
        state.serialize_field("own_username", self.own_username.get())?;
        state.serialize_field("other_identity_old", &self.other_identity_old)?;
        state.serialize_field("other_identity_new", &self.other_identity_new)?;
        state.serialize_field("other_username", self.other_username.get())?;
        state.serialize_field("did_join", &*self.did_join)?;
        state.serialize_field("invitation_payload", self.invitation_payload.get())?;
        state.serialize_field("old_hash", self.old_hash.get())?;
        state.serialize_field("new_hash", self.new_hash.get())?;
        state.serialize_field("unread_messages", &*self.unread_messages)?;
        state.end()
    }
}

/// Tracks unread messages for a user in a specific channel
#[derive(BorshDeserialize, BorshSerialize, Clone)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct UserChannelUnread {
    /// Timestamp of the last message read by the user in this channel
    pub last_read_timestamp: LwwRegister<u64>,
    /// Number of unread messages for the user in this channel
    pub unread_count: LwwRegister<u32>,
}

impl MergeableTrait for UserChannelUnread {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        MergeableTrait::merge(&mut self.last_read_timestamp, &other.last_read_timestamp)?;
        MergeableTrait::merge(&mut self.unread_count, &other.unread_count)?;
        Ok(())
    }
}

/// Tracks mentions for a user in a specific channel
#[derive(BorshDeserialize, BorshSerialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct UserChannelMentions {
    /// Message ID that caused the mention
    pub message_id: LwwRegister<MessageId>,
    /// Total mention count for this message
    pub mention_count: LwwRegister<u32>,
    /// Types of mentions (@here, @everyone, @username)
    pub mention_types: Vector<LwwRegister<String>>,
    /// Timestamp when the mention occurred
    pub timestamp: LwwRegister<u64>,
}

impl MergeableTrait for UserChannelMentions {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        MergeableTrait::merge(&mut self.message_id, &other.message_id)?;
        MergeableTrait::merge(&mut self.mention_count, &other.mention_count)?;
        MergeableTrait::merge(&mut self.mention_types, &other.mention_types)?;
        MergeableTrait::merge(&mut self.timestamp, &other.timestamp)?;
        Ok(())
    }
}

impl PartialEq for UserChannelMentions {
    fn eq(&self, other: &Self) -> bool {
        self.message_id.get() == other.message_id.get()
    }
}

impl Eq for UserChannelMentions {}

impl std::hash::Hash for UserChannelMentions {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.message_id.get().hash(state);
    }
}

impl AsRef<[u8]> for UserChannelMentions {
    fn as_ref(&self) -> &[u8] {
        self.message_id.get().as_bytes()
    }
}

#[app::state(emits = Event)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct CurbChat {
    owner: UserId,
    name: LwwRegister<String>,
    created_at: LwwRegister<u64>,
    members: UnorderedSet<UserId>,
    member_usernames: UnorderedMap<UserId, LwwRegister<String>>,
    channels: UnorderedMap<Channel, ChannelInfo>,
    threads: UnorderedMap<MessageId, Vector<Message>>,
    channel_members: UnorderedMap<Channel, UnorderedSet<UserId>>,
    moderators: UnorderedSet<UserId>,
    dm_chats: UnorderedMap<UserId, Vector<DMChatInfo>>,
    is_dm: LwwRegister<bool>,
    reactions: UnorderedMap<MessageId, UnorderedMap<String, UnorderedSet<String>>>,
    user_channel_unread: UnorderedMap<UserId, UnorderedMap<Channel, UserChannelUnread>>,
    user_channel_mentions: UnorderedMap<UserId, UnorderedMap<Channel, Vector<UserChannelMentions>>>,
}

#[app::logic]
impl CurbChat {
    #[app::init]
    pub fn init(
        name: String,
        default_channels: Vec<Channel>,
        created_at: u64,
        is_dm: bool,
        invitee: Option<UserId>,
        owner_username: Option<String>,
        invitee_username: Option<String>,
    ) -> CurbChat {
        let executor_id = UserId::new(env::executor_id());

        let mut channels: UnorderedMap<Channel, ChannelInfo> = UnorderedMap::new();
        let mut members: UnorderedSet<UserId> = UnorderedSet::new();
        let mut channel_members: UnorderedMap<Channel, UnorderedSet<UserId>> = UnorderedMap::new();
        let mut moderators: UnorderedSet<UserId> = UnorderedSet::new();
        let mut member_usernames: UnorderedMap<UserId, LwwRegister<String>> = UnorderedMap::new();

        let _ = members.insert(executor_id);

        if let Some(owner_username) = owner_username.clone() {
            let _ = member_usernames.insert(executor_id, LwwRegister::new(owner_username));
        }

        if is_dm {
            if let Some(invitee_id) = invitee {
                let _ = members.insert(invitee_id);

                if let Some(invitee_username) = invitee_username {
                    let _ = member_usernames.insert(invitee_id, LwwRegister::new(invitee_username));
                }
            }
        }

        for c in default_channels {
            let channel_info = ChannelInfo {
                messages: Vector::new(),
                channel_type: LwwRegister::new(ChannelType::Default),
                read_only: LwwRegister::new(false),
                meta: ChannelMetadata {
                    created_at: LwwRegister::new(created_at),
                    created_by: executor_id,
                    created_by_username: owner_username.clone().map(LwwRegister::new),
                    read_only: UnorderedSet::new(),
                    moderators: UnorderedSet::new(),
                    links_allowed: LwwRegister::new(true),
                },
                last_read: UnorderedMap::new(),
            };
            let _ = channels.insert(c.clone(), channel_info);
            let mut new_members = UnorderedSet::new();
            let _ = new_members.insert(executor_id);

            if is_dm {
                if let Some(invitee_id) = &invitee {
                    let _ = new_members.insert(invitee_id.clone());
                }
            }

            let _ = channel_members.insert(c.clone(), new_members);
            let _ = moderators.insert(executor_id);
        }

        CurbChat {
            owner: executor_id,
            name: LwwRegister::new(name),
            created_at: LwwRegister::new(created_at),
            members,
            member_usernames,
            channels,
            threads: UnorderedMap::new(),
            channel_members,
            moderators: moderators,
            dm_chats: UnorderedMap::new(),
            is_dm: LwwRegister::new(is_dm),
            reactions: UnorderedMap::new(),
            user_channel_unread: UnorderedMap::new(),
            user_channel_mentions: UnorderedMap::new(),
        }
    }

    pub fn join_chat(&mut self, username: String, is_dm: bool) -> app::Result<String, String> {
        let executor_id = self.get_executor_id();

        if self.members.contains(&executor_id).unwrap_or(false) {
            return Err("Already a member of the chat".to_string());
        }

        // Validate username
        if username.trim().is_empty() {
            return Err("Username cannot be empty".to_string());
        }

        if username.len() > 50 {
            return Err("Username cannot be longer than 50 characters".to_string());
        }

        if !is_dm {
            if let Ok(entries) = self.member_usernames.entries() {
                for (_, existing_username) in entries {
                    if existing_username.get() == &username {
                        return Err("Username is already taken".to_string());
                    }
                }
            }
        }

        let _ = self.members.insert(executor_id);
        let _ = self
            .member_usernames
            .insert(executor_id, LwwRegister::new(username));

        let mut user_unread_channels = UnorderedMap::new();

        if let Ok(entries) = self.channels.entries() {
            for (channel, channel_info) in entries {
                if *channel_info.channel_type == ChannelType::Default {
                    let channel_clone = channel.clone();
                    let mut channel_members = match self.channel_members.get(&channel) {
                        Ok(Some(members)) => members,
                        _ => continue,
                    };

                    let _ = channel_members.insert(executor_id);
                    let _ = self.channel_members.insert(channel, channel_members);

                    let unread_info = UserChannelUnread {
                        last_read_timestamp: LwwRegister::new(0),
                        unread_count: LwwRegister::new(
                            channel_info.messages.len().unwrap_or(0) as u32
                        ),
                    };
                    let _ = user_unread_channels.insert(channel_clone, unread_info);
                }
            }
        }

        let _ = self
            .user_channel_unread
            .insert(executor_id, user_unread_channels);

        // Initialize mentions tracking for the user
        self.initialize_mentions_tracking_for_user_in_channels(&executor_id);

        app::emit!(Event::ChatJoined(executor_id.clone().to_string()));

        Ok("Successfully joined the chat".to_string())
    }

    fn initialize_mentions_tracking_for_user_in_channels(&mut self, user_id: &UserId) {
        // Initialize mentions tracking for all default channels
        let mut channels_to_initialize = Vec::new();
        if let Ok(entries) = self.channels.entries() {
            for (channel, _) in entries {
                if let Ok(Some(members)) = self.channel_members.get(&channel) {
                    if members.contains(user_id).unwrap_or(false) {
                        channels_to_initialize.push(channel.clone());
                    }
                }
            }
        }

        // Now initialize mentions tracking for each channel
        for channel in channels_to_initialize {
            self.initialize_mentions_tracking_for_user_in_channel(user_id, &channel);
        }
    }

    fn get_executor_id(&self) -> UserId {
        UserId::new(env::executor_id())
    }

    pub fn get_chat_name(&self) -> String {
        self.name.get().clone()
    }

    fn get_user_channel_unread_info(&self, user_id: &UserId, channel: &Channel) -> (u32, u64) {
        // Get user's unread info for this channel
        if let Ok(Some(user_unread)) = self.user_channel_unread.get(user_id) {
            if let Ok(Some(channel_unread)) = user_unread.get(channel) {
                return (
                    *channel_unread.unread_count,
                    *channel_unread.last_read_timestamp,
                );
            }
        }

        (0, 0)
    }

    fn get_user_channel_mention_count(&self, user_id: &UserId, channel: &Channel) -> u32 {
        // Get user's mention count for this channel
        if let Ok(Some(user_mentions)) = self.user_channel_mentions.get(user_id) {
            if let Ok(Some(channel_mentions)) = user_mentions.get(channel) {
                let mut total_mentions = 0;
                if let Ok(iter) = channel_mentions.iter() {
                    for mention_entry in iter {
                        total_mentions += *mention_entry.mention_count;
                    }
                }
                return total_mentions;
            }
        }

        0
    }

    pub fn mark_messages_as_read(
        &mut self,
        channel: Channel,
        timestamp: u64,
    ) -> app::Result<String, String> {
        let executor_id = self.get_executor_id();

        if let Ok(Some(members)) = self.channel_members.get(&channel) {
            if !members.contains(&executor_id).unwrap_or(false) {
                return Err("You are not a member of this channel".to_string());
            }
        } else {
            return Err("Channel not found".to_string());
        }

        let mut user_unread = match self.user_channel_unread.get(&executor_id) {
            Ok(Some(unread)) => unread,
            _ => UnorderedMap::new(),
        };

        let mut channel_unread = match user_unread.get(&channel) {
            Ok(Some(unread)) => unread.clone(),
            _ => UserChannelUnread {
                last_read_timestamp: LwwRegister::new(0),
                unread_count: LwwRegister::new(0),
            },
        };

        channel_unread.last_read_timestamp.set(timestamp);

        if let Ok(Some(channel_info)) = self.channels.get(&channel) {
            let mut unread_count = 0;
            if let Ok(iter) = channel_info.messages.iter() {
                for message in iter {
                    if *message.timestamp > timestamp {
                        unread_count += 1;
                    }
                }
            }
            channel_unread.unread_count.set(unread_count);
        }

        let _ = user_unread.insert(channel.clone(), channel_unread);
        let _ = self.user_channel_unread.insert(executor_id, user_unread);

        // Reset mentions for this user in this channel when messages are read
        self.reset_mentions_for_user_in_channel(&executor_id, &channel);

        Ok("Messages marked as read successfully".to_string())
    }

    pub fn get_channel_unread_count(&self, channel: Channel) -> app::Result<u32, String> {
        let executor_id = self.get_executor_id();

        if let Ok(Some(members)) = self.channel_members.get(&channel) {
            if !members.contains(&executor_id).unwrap_or(false) {
                return Err("You are not a member of this channel".to_string());
            }
        } else {
            return Err("Channel not found".to_string());
        }

        let (unread_count, _) = self.get_user_channel_unread_info(&executor_id, &channel);
        Ok(unread_count)
    }

    pub fn get_channel_last_read_timestamp(&self, channel: Channel) -> app::Result<u64, String> {
        let executor_id = self.get_executor_id();

        if let Ok(Some(members)) = self.channel_members.get(&channel) {
            if !members.contains(&executor_id).unwrap_or(false) {
                return Err("You are not a member of this channel".to_string());
            }
        } else {
            return Err("Channel not found".to_string());
        }

        let (_, last_read_timestamp) = self.get_user_channel_unread_info(&executor_id, &channel);
        Ok(last_read_timestamp)
    }

    pub fn get_total_unread_count(&self) -> app::Result<u32, String> {
        let executor_id = self.get_executor_id();
        let mut total_unread = 0;

        if let Ok(Some(user_unread)) = self.user_channel_unread.get(&executor_id) {
            if let Ok(entries) = user_unread.entries() {
                for (_, channel_unread) in entries {
                    total_unread += *channel_unread.unread_count;
                }
            }
        }

        Ok(total_unread)
    }

    pub fn get_channel_mention_count(&self, channel: Channel) -> app::Result<u32, String> {
        let executor_id = self.get_executor_id();

        if let Ok(Some(members)) = self.channel_members.get(&channel) {
            if !members.contains(&executor_id).unwrap_or(false) {
                return Err("You are not a member of this channel".to_string());
            }
        } else {
            return Err("Channel not found".to_string());
        }

        // Get mention count for this user and channel
        if let Ok(Some(user_mentions)) = self.user_channel_mentions.get(&executor_id) {
            if let Ok(Some(channel_mentions)) = user_mentions.get(&channel) {
                return Ok(channel_mentions.len().unwrap_or(0) as u32);
            }
        }

        Ok(0)
    }

    pub fn get_total_mention_count(&self) -> app::Result<u32, String> {
        let executor_id = self.get_executor_id();
        let mut total_mentions = 0;

        // Get user's mentions tracking
        if let Ok(Some(user_mentions)) = self.user_channel_mentions.get(&executor_id) {
            if let Ok(entries) = user_mentions.entries() {
                for (_, channel_mentions) in entries {
                    total_mentions += channel_mentions.len().unwrap_or(0) as u32;
                }
            }
        }

        Ok(total_mentions)
    }

    fn reset_unread_tracking_for_user_in_channel(&mut self, user_id: &UserId, channel: &Channel) {
        if let Ok(Some(mut user_unread)) = self.user_channel_unread.get(user_id) {
            let _ = user_unread.remove(channel);
            let _ = self
                .user_channel_unread
                .insert(user_id.clone(), user_unread);
        }
    }

    fn reset_mentions_for_user_in_channel(&mut self, user_id: &UserId, channel: &Channel) {
        if let Ok(Some(mut user_mentions)) = self.user_channel_mentions.get(user_id) {
            // Create a new empty vector for this channel
            let empty_mentions = Vector::new();
            let _ = user_mentions.insert(channel.clone(), empty_mentions);
            let _ = self
                .user_channel_mentions
                .insert(user_id.clone(), user_mentions);
        }
    }

    fn increment_unread_count_for_channel(
        &mut self,
        channel: &Channel,
        sender_id: &UserId,
        _message_timestamp: u64,
    ) {
        if let Ok(Some(members)) = self.channel_members.get(channel) {
            if let Ok(iter) = members.iter() {
                for member_id in iter {
                    if member_id == *sender_id {
                        continue;
                    }

                    let mut user_unread = match self.user_channel_unread.get(&member_id) {
                        Ok(Some(unread)) => unread,
                        _ => UnorderedMap::new(),
                    };

                    let mut channel_unread = match user_unread.get(channel) {
                        Ok(Some(unread)) => unread.clone(),
                        _ => UserChannelUnread {
                            last_read_timestamp: LwwRegister::new(0),
                            unread_count: LwwRegister::new(0),
                        },
                    };

                    channel_unread
                        .unread_count
                        .set(*channel_unread.unread_count + 1);

                    let _ = user_unread.insert(channel.clone(), channel_unread);
                    let _ = self
                        .user_channel_unread
                        .insert(member_id.clone(), user_unread);
                }
            }
        }
    }

    fn handle_mentions_for_channel(
        &mut self,
        channel: &Channel,
        sender_id: &UserId,
        message_id: &MessageId,
        mentions: &[UserId],
        mentions_usernames: &[String],
        timestamp: u64,
    ) {
        // Get all members of this channel
        if let Ok(Some(members)) = self.channel_members.get(channel) {
            if let Ok(iter) = members.iter() {
                for member_id in iter {
                    // Skip the sender
                    if member_id == *sender_id {
                        continue;
                    }

                    // Get or create user's mentions tracking
                    let mut user_mentions = match self.user_channel_mentions.get(&member_id) {
                        Ok(Some(mentions_map)) => mentions_map,
                        _ => UnorderedMap::new(),
                    };

                    // Get or create channel mentions vector
                    let mut channel_mentions = match user_mentions.get(channel) {
                        Ok(Some(mentions_vector)) => {
                            let mut copy = Vector::new();
                            if let Ok(iter) = mentions_vector.iter() {
                                for mention in iter {
                                    let _ = copy.push(mention);
                                }
                            }
                            copy
                        }
                        _ => Vector::new(),
                    };

                    // Check if this member should be notified
                    let mut mention_types = Vector::new();
                    let mut should_notify = false;

                    // Check if this member is directly mentioned by username
                    if mentions.contains(&member_id) {
                        let _ = mention_types.push(LwwRegister::new("user".to_string()));
                        should_notify = true;
                    }

                    // Check for @here and @everyone mentions (these notify everyone)
                    for username in mentions_usernames {
                        if username == "here" || username == "everyone" {
                            let _ = mention_types.push(LwwRegister::new(username.clone()));
                            should_notify = true;
                        }
                    }

                    // Skip if no mentions apply to this member
                    if !should_notify {
                        continue;
                    }

                    // Calculate total mention count (1 per message)
                    let mention_count = 1;

                    // Create the mention tracking entry
                    let mention_entry = UserChannelMentions {
                        message_id: LwwRegister::new(message_id.clone()),
                        mention_count: LwwRegister::new(mention_count),
                        mention_types,
                        timestamp: LwwRegister::new(timestamp),
                    };

                    // Add to the vector
                    let _ = channel_mentions.push(mention_entry);

                    // Update the mentions tracking
                    let _ = user_mentions.insert(channel.clone(), channel_mentions);
                    let _ = self
                        .user_channel_mentions
                        .insert(member_id.clone(), user_mentions);
                }
            }
        }
    }

    fn initialize_unread_tracking_for_user_in_channel(
        &mut self,
        user_id: &UserId,
        channel: &Channel,
    ) {
        let mut user_unread = match self.user_channel_unread.get(user_id) {
            Ok(Some(unread)) => unread,
            _ => UnorderedMap::new(),
        };

        let existing_message_count = if let Ok(Some(channel_info)) = self.channels.get(channel) {
            channel_info.messages.len().unwrap_or(0) as u32
        } else {
            0
        };

        let unread_info = UserChannelUnread {
            last_read_timestamp: LwwRegister::new(0),
            unread_count: LwwRegister::new(existing_message_count),
        };
        let _ = user_unread.insert(channel.clone(), unread_info);
        let _ = self
            .user_channel_unread
            .insert(user_id.clone(), user_unread);

        // Initialize mentions tracking for this user in this channel
        self.initialize_mentions_tracking_for_user_in_channel(user_id, channel);
    }

    fn initialize_mentions_tracking_for_user_in_channel(
        &mut self,
        user_id: &UserId,
        channel: &Channel,
    ) {
        // Get or create user's mentions tracking
        let mut user_mentions = match self.user_channel_mentions.get(user_id) {
            Ok(Some(mentions_map)) => mentions_map,
            _ => UnorderedMap::new(),
        };

        // Initialize mentions tracking for this channel
        let mentions_vector = Vector::new();
        let _ = user_mentions.insert(channel.clone(), mentions_vector);
        let _ = self
            .user_channel_mentions
            .insert(user_id.clone(), user_mentions);
    }

    fn initialize_unread_tracking_for_channel(
        &mut self,
        channel: &Channel,
        members: &UnorderedSet<UserId>,
    ) {
        if let Ok(iter) = members.iter() {
            for member_id in iter {
                let mut user_unread = match self.user_channel_unread.get(&member_id) {
                    Ok(Some(unread)) => unread,
                    _ => UnorderedMap::new(),
                };

                let unread_info = UserChannelUnread {
                    last_read_timestamp: LwwRegister::new(0),
                    unread_count: LwwRegister::new(0),
                };
                let _ = user_unread.insert(channel.clone(), unread_info);
                let _ = self
                    .user_channel_unread
                    .insert(member_id.clone(), user_unread);

                // Initialize mentions tracking for this member in this channel
                self.initialize_mentions_tracking_for_user_in_channel(&member_id, channel);
            }
        }
    }

    pub fn create_channel(
        &mut self,
        channel: Channel,
        channel_type: ChannelType,
        read_only: bool,
        moderators: Vec<UserId>,
        links_allowed: bool,
        created_at: u64,
    ) -> app::Result<String, String> {
        if *self.is_dm {
            return Err("Cannot create channels in a DM chat".to_string());
        }

        if self.channels.contains(&channel).unwrap_or(false) {
            return Err("Channel already exists".to_string());
        }

        let executor_id = self.get_executor_id();

        // Create a copy of moderators for the metadata
        let mut moderators_copy = UnorderedSet::new();
        for moderator in &moderators {
            let _ = moderators_copy.insert(moderator.clone());
        }

        let channel_info = ChannelInfo {
            messages: Vector::new(),
            channel_type: LwwRegister::new(channel_type),
            read_only: LwwRegister::new(read_only),
            meta: ChannelMetadata {
                created_at: LwwRegister::new(created_at),
                created_by: executor_id,
                created_by_username: self
                    .member_usernames
                    .get(&executor_id)
                    .ok()
                    .flatten()
                    .map(|u| LwwRegister::new(u.get().clone())),
                read_only: UnorderedSet::new(),
                moderators: moderators_copy,
                links_allowed: LwwRegister::new(links_allowed),
            },
            last_read: UnorderedMap::new(),
        };

        let _ = self.channels.insert(channel.clone(), channel_info);
        let mut initial_members = UnorderedSet::new();
        // Copy moderators to initial_members
        for moderator in &moderators {
            let _ = initial_members.insert(moderator.clone());
        }
        let _ = initial_members.insert(executor_id);

        // Create a copy for unread tracking initialization
        let mut initial_members_copy = UnorderedSet::new();
        if let Ok(iter) = initial_members.iter() {
            for member in iter {
                let _ = initial_members_copy.insert(member.clone());
            }
        }

        let _ = self
            .channel_members
            .insert(channel.clone(), initial_members);

        // Initialize unread tracking for initial members
        self.initialize_unread_tracking_for_channel(&channel, &initial_members_copy);

        app::emit!(Event::ChannelCreated(channel.name.get().clone()));
        Ok("Channel created".to_string())
    }

    pub fn get_chat_usernames(&self) -> HashMap<UserId, String> {
        let mut usernames = HashMap::new();
        if let Ok(entries) = self.member_usernames.entries() {
            for (user_id, username) in entries {
                usernames.insert(user_id.clone(), username.get().clone());
            }
        }
        usernames
    }

    pub fn get_username(&self, user_id: UserId) -> String {
        self.member_usernames
            .get(&user_id)
            .unwrap()
            .unwrap()
            .get()
            .clone()
    }

    pub fn get_chat_members(&self) -> Vec<UserId> {
        let executor_id = self.get_executor_id();
        let mut members = Vec::new();
        if let Ok(iter) = self.members.iter() {
            for member in iter {
                if member != executor_id {
                    members.push(member.clone());
                }
            }
        }
        members
    }

    pub fn get_channels(&self) -> HashMap<String, PublicChannelInfo> {
        let mut channels = HashMap::new();
        let executor_id = self.get_executor_id();

        if let Ok(entries) = self.channels.entries() {
            for (channel, channel_info) in entries {
                if let Ok(Some(members)) = self.channel_members.get(&channel) {
                    if members.contains(&executor_id).unwrap_or(false) {
                        // Get unread information for this user and channel
                        let (unread_count, last_read_timestamp) =
                            self.get_user_channel_unread_info(&executor_id, &channel);
                        let unread_mention_count =
                            self.get_user_channel_mention_count(&executor_id, &channel);

                        let public_info = PublicChannelInfo {
                            channel_type: channel_info.channel_type.get().clone(),
                            read_only: *channel_info.read_only,
                            created_at: *channel_info.meta.created_at,
                            created_by: channel_info.meta.created_by,
                            created_by_username: self
                                .member_usernames
                                .get(&channel_info.meta.created_by)
                                .unwrap()
                                .unwrap()
                                .get()
                                .clone(),
                            links_allowed: *channel_info.meta.links_allowed,
                            unread_count,
                            last_read_timestamp,
                            unread_mention_count,
                        };
                        channels.insert(channel.name.get().clone(), public_info);
                    }
                }
            }
        }
        channels
    }

    pub fn get_all_channels(&self) -> HashMap<String, PublicChannelInfo> {
        let mut channels = HashMap::new();
        let executor_id = self.get_executor_id();

        if let Ok(entries) = self.channels.entries() {
            for (channel, channel_info) in entries {
                let should_include = match *channel_info.channel_type {
                    ChannelType::Public | ChannelType::Default => true,
                    ChannelType::Private => {
                        // Only include private channels if user is a member
                        if let Ok(Some(members)) = self.channel_members.get(&channel) {
                            members.contains(&executor_id).unwrap_or(false)
                        } else {
                            false
                        }
                    }
                };

                if should_include {
                    let created_by_username = self
                        .member_usernames
                        .get(&channel_info.meta.created_by)
                        .unwrap()
                        .unwrap();

                    // Get unread information for this user and channel
                    let (unread_count, last_read_timestamp) =
                        self.get_user_channel_unread_info(&executor_id, &channel);
                    let unread_mention_count =
                        self.get_user_channel_mention_count(&executor_id, &channel);

                    let public_info = PublicChannelInfo {
                        channel_type: channel_info.channel_type.get().clone(),
                        read_only: *channel_info.read_only,
                        created_at: *channel_info.meta.created_at,
                        created_by_username: created_by_username.get().clone(),
                        created_by: channel_info.meta.created_by,
                        links_allowed: *channel_info.meta.links_allowed,
                        unread_count,
                        last_read_timestamp,
                        unread_mention_count,
                    };
                    channels.insert(channel.name.get().clone(), public_info);
                }
            }
        }
        channels
    }

    pub fn get_channel_members(
        &self,
        channel: Channel,
    ) -> app::Result<HashMap<UserId, String>, String> {
        let executor_id = self.get_executor_id();
        let members = match self.channel_members.get(&channel) {
            Ok(Some(members)) => members,
            _ => return Err("Channel not found".to_string()),
        };

        if !members.contains(&executor_id).unwrap_or(false) {
            return Err("You are not a member of this channel".to_string());
        }

        let mut members_map = HashMap::new();

        if let Ok(iter) = members.iter() {
            for member in iter {
                let username = self.member_usernames.get(&member).unwrap().unwrap();
                members_map.insert(member.clone(), username.get().clone());
            }
        }

        Ok(members_map)
    }

    pub fn get_channel_info(&self, channel: Channel) -> app::Result<PublicChannelMetadata, String> {
        let channel_info = match self.channels.get(&channel) {
            Ok(Some(info)) => info,
            _ => return Err("Channel not found".to_string()),
        };
        Ok(PublicChannelMetadata {
            created_at: *channel_info.meta.created_at,
            created_by: channel_info.meta.created_by,
            created_by_username: self
                .member_usernames
                .get(&channel_info.meta.created_by)
                .unwrap()
                .unwrap()
                .get()
                .clone(),
            links_allowed: *channel_info.meta.links_allowed,
        })
    }

    pub fn invite_to_channel(
        &mut self,
        channel: Channel,
        user: UserId,
    ) -> app::Result<String, String> {
        if *self.is_dm {
            return Err("Cannot invite to a DM chat".to_string());
        }

        let executor_id = self.get_executor_id();

        match self.channels.get(&channel) {
            Ok(Some(info)) => info,
            _ => return Err("Channel not found".to_string()),
        };

        let members = match self.channel_members.get(&channel) {
            Ok(Some(members)) => members,
            _ => return Err("Channel not found".to_string()),
        };

        if !members.contains(&executor_id).unwrap_or(false) {
            return Err("You are not a member of this channel".to_string());
        }

        if members.contains(&user).unwrap_or(false) {
            return Err("User is already a member of this channel".to_string());
        }

        if !self.members.contains(&user).unwrap_or(false) {
            return Err("User is not a member of the chat".to_string());
        }

        let mut updated_members = UnorderedSet::new();
        if let Ok(iter) = members.iter() {
            for member in iter {
                let _ = updated_members.insert(member.clone());
            }
        }
        let _ = updated_members.insert(user.clone());
        let _ = self
            .channel_members
            .insert(channel.clone(), updated_members);

        // Initialize unread tracking for the invited user in this channel
        self.initialize_unread_tracking_for_user_in_channel(&user, &channel);

        // Initialize mentions tracking for the invited user in this channel
        self.initialize_mentions_tracking_for_user_in_channel(&user, &channel);

        app::emit!(Event::ChannelInvited(channel.name.get().clone()));
        Ok("User invited to channel".to_string())
    }

    pub fn get_non_member_users(
        &self,
        channel: Channel,
    ) -> app::Result<HashMap<UserId, String>, String> {
        if *self.is_dm {
            return Err("Cannot create channels in a DM chat".to_string());
        }

        let members = match self.channel_members.get(&channel) {
            Ok(Some(members)) => members,
            _ => return Err("Channel not found".to_string()),
        };

        let mut non_member_users = HashMap::new();
        if let Ok(iter) = self.members.iter() {
            for member in iter {
                if !members.contains(&member).unwrap_or(false) {
                    let username = self.member_usernames.get(&member).unwrap().unwrap();
                    non_member_users.insert(member.clone(), username.get().clone());
                }
            }
        }

        Ok(non_member_users)
    }

    pub fn join_channel(&mut self, channel: Channel) -> app::Result<String, String> {
        if *self.is_dm {
            return Err("Cannot create channels in a DM chat".to_string());
        }
        let executor_id = self.get_executor_id();

        let channel_info = match self.channels.get(&channel) {
            Ok(Some(info)) => info,
            _ => return Err("Channel not found".to_string()),
        };

        if *channel_info.channel_type != ChannelType::Public {
            return Err("Can only join public channels".to_string());
        }

        let members = match self.channel_members.get(&channel) {
            Ok(Some(members)) => members,
            _ => return Err("Channel not found".to_string()),
        };

        if members.contains(&executor_id).unwrap_or(false) {
            return Err("Already a member of this channel".to_string());
        }

        let mut updated_members = UnorderedSet::new();
        if let Ok(iter) = members.iter() {
            for member in iter {
                let _ = updated_members.insert(member.clone());
            }
        }
        let _ = updated_members.insert(executor_id);
        let _ = self
            .channel_members
            .insert(channel.clone(), updated_members);

        // Initialize unread tracking for this user in this channel
        self.initialize_unread_tracking_for_user_in_channel(&executor_id, &channel);

        // Initialize mentions tracking for this user in this channel
        self.initialize_mentions_tracking_for_user_in_channel(&executor_id, &channel);

        app::emit!(Event::ChannelJoined(channel.name.get().clone()));
        Ok("Joined channel".to_string())
    }

    pub fn leave_channel(&mut self, channel: Channel) -> app::Result<String, String> {
        if *self.is_dm {
            return Err("Cannot leave a DM chat".to_string());
        }
        let executor_id = self.get_executor_id();

        let members = match self.channel_members.get(&channel) {
            Ok(Some(members)) => members,
            _ => return Err("Channel not found".to_string()),
        };

        if !members.contains(&executor_id).unwrap_or(false) {
            return Err("You are not a member of this channel".to_string());
        }

        let mut updated_members = UnorderedSet::new();
        if let Ok(iter) = members.iter() {
            for member in iter {
                let _ = updated_members.insert(member.clone());
            }
        }
        let _ = updated_members.remove(&executor_id);
        let _ = self
            .channel_members
            .insert(channel.clone(), updated_members);

        // Reset unread tracking for this user in this channel
        self.reset_unread_tracking_for_user_in_channel(&executor_id, &channel);

        // Reset mentions tracking for this user in this channel
        self.reset_mentions_for_user_in_channel(&executor_id, &channel);

        app::emit!(Event::ChannelLeft(channel.name.get().clone()));
        Ok("Left channel".to_string())
    }

    fn get_message_id(
        &self,
        account: &UserId,
        group: &Channel,
        message: &String,
        timestamp: u64,
    ) -> MessageId {
        let mut hash_input = Vec::new();
        hash_input.extend_from_slice(group.as_ref());
        hash_input.extend_from_slice(message.as_bytes());
        hash_input.extend_from_slice(account.as_ref());
        hash_input.extend_from_slice(&timestamp.to_be_bytes());

        let message_counter = self.get_message_counter(group);
        hash_input.extend_from_slice(&message_counter.to_be_bytes());

        let mut s = MessageId::with_capacity(hash_input.len() * 2);
        for &b in &hash_input {
            write!(&mut s, "{:02x}", b).unwrap();
        }
        format!("{}_{}", s, timestamp)
    }

    fn get_message_counter(&self, group: &Channel) -> u64 {
        match self.channels.get(group) {
            Ok(Some(channel_info)) => channel_info.messages.len().unwrap_or(0) as u64 + 1,
            _ => 1,
        }
    }

    pub fn send_message(
        &mut self,
        group: Channel,
        message: String,
        mentions: Vec<UserId>,
        mentions_usernames: Vec<String>,
        parent_message: Option<MessageId>,
        timestamp: u64,
        sender_username: String,
        files: Option<Vec<AttachmentInput>>,
        images: Option<Vec<AttachmentInput>>,
    ) -> app::Result<Message, String> {
        let executor_id = self.get_executor_id();
        let sender_username = match self.member_usernames.get(&executor_id) {
            Ok(Some(username)) => username.get().clone(),
            _ => sender_username,
        };
        let message_id = self.get_message_id(&executor_id, &group, &message, timestamp);
        let current_context = env::context_id();

        let files_vector = attachment_inputs_to_vector(files, &current_context)?;
        let images_vector = attachment_inputs_to_vector(images, &current_context)?;

        let mut mentions_set = UnorderedSet::new();
        for m in mentions.clone() {
            let _ = mentions_set.insert(m);
        }
        let mut mentions_usernames_vec = Vector::new();
        for m in mentions_usernames.clone() {
            let _ = mentions_usernames_vec.push(LwwRegister::new(m));
        }
        let message = Message {
            timestamp: LwwRegister::new(timestamp),
            sender: executor_id,
            sender_username: LwwRegister::new(sender_username),
            mentions: mentions_set,
            mentions_usernames: mentions_usernames_vec,
            files: files_vector,
            images: images_vector,
            id: LwwRegister::new(message_id.clone()),
            text: LwwRegister::new(message),
            deleted: None,
            edited_on: None,
            group: LwwRegister::new(group.name.get().clone()),
        };

        let mut channel_info = match self.channels.get(&group) {
            Ok(Some(info)) => info,
            _ => return Err("Channel not found".to_string()),
        };
        if let Some(parent_message) = parent_message.clone() {
            let mut thread_messages = match self.threads.get(&parent_message) {
                Ok(Some(messages)) => messages,
                _ => Vector::new(),
            };
            let _ = thread_messages.push(message.clone());
            let _ = self.threads.insert(parent_message, thread_messages);
        } else {
            let _ = channel_info.messages.push(message.clone());
            let _ = self.channels.insert(group.clone(), channel_info);

            // Increment unread count for all users in the channel (except the sender)
            self.increment_unread_count_for_channel(&group, &executor_id, timestamp);

            // Handle mentions for all users in the channel (except the sender)
            let mentions_clone = mentions.clone();
            let mentions_usernames_clone = mentions_usernames.clone();
            self.handle_mentions_for_channel(
                &group,
                &executor_id,
                &message_id,
                &mentions_clone,
                &mentions_usernames_clone,
                timestamp,
            );
        }

        if parent_message.is_some() {
            app::emit!(Event::MessageSentThread(MessageSentEvent {
                message_id: message_id.clone(),
                channel: group.name.get().clone(),
            }));
        } else {
            app::emit!(Event::MessageSent(MessageSentEvent {
                message_id: message_id.clone(),
                channel: group.name.get().clone(),
            }));
        }

        Ok(message)
    }

    pub fn get_messages(
        &self,
        group: Channel,
        parent_message: Option<MessageId>,
        limit: Option<usize>,
        offset: Option<usize>,
    ) -> app::Result<FullMessageResponse, String> {
        let executor_id = self.get_executor_id();

        let members = match self.channel_members.get(&group) {
            Ok(Some(members)) => members,
            _ => return Err("Channel not found".to_string()),
        };

        if !members.contains(&executor_id).unwrap_or(false) {
            return Err("You are not a member of this channel".to_string());
        }

        if let Some(parent_id) = parent_message {
            let thread_messages = match self.threads.get(&parent_id) {
                Ok(Some(messages)) => messages,
                _ => {
                    return Ok(FullMessageResponse {
                        total_count: 0,
                        messages: Vec::new(),
                        start_position: 0,
                    })
                }
            };

            let total_messages = thread_messages.len().unwrap_or(0);
            let limit = limit.unwrap_or(total_messages);
            let offset = offset.unwrap_or(0);

            if total_messages == 0 {
                return Ok(FullMessageResponse {
                    total_count: 0,
                    messages: Vec::new(),
                    start_position: 0,
                });
            }

            let mut messages: Vec<MessageWithReactions> = Vec::new();
            if let Ok(iter) = thread_messages.iter() {
                let all_messages: Vec<_> = iter.collect();

                if !all_messages.is_empty() {
                    let total_len = all_messages.len();
                    if offset >= total_len {
                        return Ok(FullMessageResponse {
                            total_count: total_messages as u32,
                            messages: Vec::new(),
                            start_position: offset as u32,
                        });
                    }

                    let end_idx = total_len - offset;
                    let start_idx = if end_idx > limit { end_idx - limit } else { 0 };

                    for i in start_idx..end_idx {
                        let message = &all_messages[i];
                        let message_reactions = self.reactions.get(message.id.get());

                        let reactions = match message_reactions {
                            Ok(Some(reactions)) => {
                                let mut hashmap = HashMap::new();
                                if let Ok(entries) = reactions.entries() {
                                    for (emoji, users) in entries {
                                        let mut user_vec = Vec::new();
                                        if let Ok(iter) = users.iter() {
                                            for user in iter {
                                                user_vec.push(user.clone());
                                            }
                                        }
                                        hashmap.insert(emoji, user_vec);
                                    }
                                }
                                Some(hashmap)
                            }
                            _ => None,
                        };

                        // Convert mentions sets/vectors to vecs for API response
                        let mentions_vec: Vec<UserId> = if let Ok(iter) = message.mentions.iter() {
                            iter.collect()
                        } else {
                            Vec::new()
                        };
                        let mentions_usernames_vec: Vec<String> =
                            if let Ok(iter) = message.mentions_usernames.iter() {
                                iter.map(|r| r.get().clone()).collect()
                            } else {
                                Vec::new()
                            };
                        let files_vec = attachments_vector_to_public(&message.files);
                        let images_vec = attachments_vector_to_public(&message.images);

                        messages.push(MessageWithReactions {
                            timestamp: *message.timestamp,
                            sender: message.sender.clone(),
                            sender_username: message.sender_username.get().clone(),
                            id: message.id.get().clone(),
                            text: message.text.get().clone(),
                            mentions: mentions_vec,
                            mentions_usernames: mentions_usernames_vec,
                            files: files_vec,
                            images: images_vec,
                            reactions,
                            deleted: message.deleted.as_ref().map(|r| **r),
                            edited_on: message.edited_on.as_ref().map(|r| **r),
                            thread_count: 0,
                            thread_last_timestamp: 0,
                            group: message.group.get().clone(),
                        });
                    }
                }
            }

            return Ok(FullMessageResponse {
                total_count: total_messages as u32,
                messages: messages,
                start_position: offset as u32,
            });
        }

        let channel_info = match self.channels.get(&group) {
            Ok(Some(info)) => info,
            _ => return Err("Channel not found".to_string()),
        };

        let total_messages = channel_info.messages.len().unwrap_or(0);
        let limit = limit.unwrap_or(total_messages);
        let offset = offset.unwrap_or(0);

        if total_messages == 0 {
            return Ok(FullMessageResponse {
                total_count: 0,
                messages: Vec::new(),
                start_position: 0,
            });
        }

        let mut messages: Vec<MessageWithReactions> = Vec::new();
        if let Ok(iter) = channel_info.messages.iter() {
            let all_messages: Vec<_> = iter.collect();

            if !all_messages.is_empty() {
                let total_len = all_messages.len();
                if offset >= total_len {
                    return Ok(FullMessageResponse {
                        total_count: total_messages as u32,
                        messages: Vec::new(),
                        start_position: offset as u32,
                    });
                }

                let end_idx = total_len - offset;
                let start_idx = if end_idx > limit { end_idx - limit } else { 0 };

                for i in start_idx..end_idx {
                    let message = &all_messages[i];
                    let message_reactions = self.reactions.get(message.id.get());

                    let reactions = match message_reactions {
                        Ok(Some(reactions)) => {
                            let mut hashmap = HashMap::new();
                            if let Ok(entries) = reactions.entries() {
                                for (emoji, users) in entries {
                                    let mut user_vec = Vec::new();
                                    if let Ok(iter) = users.iter() {
                                        for user in iter {
                                            user_vec.push(user.clone());
                                        }
                                    }
                                    hashmap.insert(emoji, user_vec);
                                }
                            }
                            Some(hashmap)
                        }
                        _ => None,
                    };

                    let threads_count = match self.threads.get(message.id.get()) {
                        Ok(Some(messages)) => messages.len().unwrap_or(0),
                        _ => 0,
                    };

                    let last_timestamp = match self.threads.get(message.id.get()) {
                        Ok(Some(messages)) => {
                            if threads_count > 0 {
                                if let Ok(Some(last_message)) = messages.get(threads_count - 1) {
                                    *last_message.timestamp
                                } else {
                                    0
                                }
                            } else {
                                0
                            }
                        }
                        _ => 0,
                    };

                    // Convert mentions sets/vectors to vecs for API response
                    let mentions_vec: Vec<UserId> = if let Ok(iter) = message.mentions.iter() {
                        iter.collect()
                    } else {
                        Vec::new()
                    };
                    let mentions_usernames_vec: Vec<String> =
                        if let Ok(iter) = message.mentions_usernames.iter() {
                            iter.map(|r| r.get().clone()).collect()
                        } else {
                            Vec::new()
                        };
                    let files_vec = attachments_vector_to_public(&message.files);
                    let images_vec = attachments_vector_to_public(&message.images);

                    messages.push(MessageWithReactions {
                        timestamp: *message.timestamp,
                        sender: message.sender.clone(),
                        sender_username: message.sender_username.get().clone(),
                        id: message.id.get().clone(),
                        text: message.text.get().clone(),
                        mentions: mentions_vec,
                        mentions_usernames: mentions_usernames_vec,
                        files: files_vec,
                        images: images_vec,
                        reactions,
                        deleted: message.deleted.as_ref().map(|r| **r),
                        edited_on: message.edited_on.as_ref().map(|r| **r),
                        thread_count: threads_count as u32,
                        thread_last_timestamp: last_timestamp,
                        group: message.group.get().clone(),
                    });
                }
            }
        }

        Ok(FullMessageResponse {
            total_count: total_messages as u32,
            messages: messages,
            start_position: offset as u32,
        })
    }

    pub fn update_reaction(
        &mut self,
        message_id: MessageId,
        emoji: String,
        user: String,
        add: bool,
    ) -> app::Result<String, String> {
        let mut reactions = match self.reactions.get(&message_id.clone()) {
            Ok(Some(reactions)) => reactions,
            _ => UnorderedMap::new(),
        };

        let mut emoji_reactions = match reactions.get(&emoji) {
            Ok(Some(users)) => users,
            _ => UnorderedSet::new(),
        };

        if add {
            let _ = emoji_reactions.insert(user);
        } else {
            let _ = emoji_reactions.remove(&user);
        }

        let _ = reactions.insert(emoji, emoji_reactions);
        let _ = self.reactions.insert(message_id.clone(), reactions);

        let action = if add { "added" } else { "removed" };
        app::emit!(Event::ReactionUpdated(message_id.to_string()));
        Ok(format!("Reaction {} successfully", action))
    }

    pub fn edit_message(
        &mut self,
        group: Channel,
        message_id: MessageId,
        new_message: String,
        timestamp: u64,
        parent_id: Option<MessageId>,
    ) -> app::Result<Message, String> {
        // TODO: performance on this is critical, optimization requires lot of changes not supported now
        // Reset message storage for large channels (~1K messages cap)
        let executor_id = self.get_executor_id();

        let members = match self.channel_members.get(&group) {
            Ok(Some(members)) => members,
            _ => return Err("Channel not found".to_string()),
        };

        if !members.contains(&executor_id).unwrap_or(false) {
            return Err("You are not a member of this channel".to_string());
        }

        if let Some(parent_message_id) = parent_id.clone() {
            let mut thread_messages = match self.threads.get(&parent_message_id) {
                Ok(Some(messages)) => messages,
                _ => return Err("Thread not found".to_string()),
            };

            let mut message_index: Option<usize> = None;
            let mut updated_message: Option<Message> = None;

            if let Ok(iter) = thread_messages.iter() {
                for (index, message) in iter.enumerate() {
                    if *message.id == message_id {
                        if message.sender != executor_id {
                            return Err("You can only edit your own messages".to_string());
                        }

                        message_index = Some(index);
                        break;
                    }
                }
            }

            if let Some(index) = message_index {
                if let Ok(Some(original_message)) = thread_messages.get(index) {
                    let mut updated_msg = original_message.clone();
                    updated_msg.text.set(new_message.clone());
                    updated_msg.edited_on = Some(LwwRegister::new(timestamp));

                    let _ = thread_messages.update(index, updated_msg.clone());
                    updated_message = Some(updated_msg);
                }
            } else {
                return Err("Message not found in thread".to_string());
            }

            let _ = self.threads.insert(parent_message_id, thread_messages);

            match updated_message {
                Some(msg) => {
                    if parent_id.is_some() {
                        app::emit!(Event::MessageSentThread(MessageSentEvent {
                            message_id: msg.id.get().clone(),
                            channel: group.name.get().clone(),
                        }));
                    } else {
                        app::emit!(Event::MessageSent(MessageSentEvent {
                            message_id: msg.id.get().clone(),
                            channel: group.name.get().clone(),
                        }));
                    }
                    Ok(msg)
                }
                None => Err("Failed to update thread message".to_string()),
            }
        } else {
            let mut channel_info = match self.channels.get(&group) {
                Ok(Some(info)) => info,
                _ => return Err("Channel not found".to_string()),
            };

            let mut message_index: Option<usize> = None;
            let mut updated_message: Option<Message> = None;

            if let Ok(iter) = channel_info.messages.iter() {
                for (index, message) in iter.enumerate() {
                    if *message.id == message_id {
                        if message.sender != executor_id {
                            return Err("You can only edit your own messages".to_string());
                        }

                        message_index = Some(index);
                        break;
                    }
                }
            }

            if let Some(index) = message_index {
                if let Ok(Some(original_message)) = channel_info.messages.get(index) {
                    let mut updated_msg = original_message.clone();
                    updated_msg.text.set(new_message.clone());
                    updated_msg.edited_on = Some(LwwRegister::new(timestamp));

                    let _ = channel_info.messages.update(index, updated_msg.clone());
                    updated_message = Some(updated_msg);
                }
            } else {
                return Err("Message not found".to_string());
            }
            let _ = self.channels.insert(group.clone(), channel_info);

            match updated_message {
                Some(msg) => {
                    if parent_id.is_some() {
                        app::emit!(Event::MessageSentThread(MessageSentEvent {
                            message_id: msg.id.get().clone(),
                            channel: group.name.get().clone(),
                        }));
                    } else {
                        app::emit!(Event::MessageSent(MessageSentEvent {
                            message_id: msg.id.get().clone(),
                            channel: group.name.get().clone(),
                        }));
                    }
                    Ok(msg)
                }
                None => Err("Failed to update message".to_string()),
            }
        }
    }

    pub fn delete_message(
        &mut self,
        group: Channel,
        message_id: MessageId,
        parent_id: Option<MessageId>,
    ) -> app::Result<String, String> {
        let executor_id = self.get_executor_id();

        if let Some(parent_message_id) = parent_id.clone() {
            let mut thread_messages = match self.threads.get(&parent_message_id) {
                Ok(Some(messages)) => messages,
                _ => return Err("Thread not found".to_string()),
            };

            let mut message_index: Option<usize> = None;
            let mut target_message: Option<Message> = None;

            if let Ok(iter) = thread_messages.iter() {
                for (index, message) in iter.enumerate() {
                    if *message.id == message_id {
                        message_index = Some(index);
                        target_message = Some(message.clone());
                        break;
                    }
                }
            }

            if message_index.is_none() {
                return Err("Message not found in thread".to_string());
            }

            let message = target_message.unwrap();

            let is_message_owner = message.sender == executor_id;
            let is_moderator = self.moderators.contains(&executor_id).unwrap_or(false);
            let is_owner = self.owner == executor_id;

            if !is_message_owner && !is_moderator && !is_owner {
                return Err("You don't have permission to delete this message".to_string());
            }

            if let Some(index) = message_index {
                let mut deleted_message = message.clone();
                deleted_message.text.set("".to_string());
                deleted_message.deleted = Some(LwwRegister::new(true));

                let _ = thread_messages.update(index, deleted_message);
            }

            let _ = self.reactions.remove(&message_id);

            let _ = self.threads.insert(parent_message_id, thread_messages);

            if parent_id.is_some() {
                app::emit!(Event::MessageSentThread(MessageSentEvent {
                    message_id: message.id.get().clone(),
                    channel: group.name.get().clone(),
                }));
            } else {
                app::emit!(Event::MessageSent(MessageSentEvent {
                    message_id: message.id.get().clone(),
                    channel: group.name.get().clone(),
                }));
            }

            Ok("Thread message deleted successfully".to_string())
        } else {
            let mut channel_info = match self.channels.get(&group) {
                Ok(Some(info)) => info,
                _ => return Err("Channel not found".to_string()),
            };

            let mut message_index: Option<usize> = None;
            let mut target_message: Option<Message> = None;

            if let Ok(iter) = channel_info.messages.iter() {
                for (index, message) in iter.enumerate() {
                    if *message.id == message_id {
                        message_index = Some(index);
                        target_message = Some(message.clone());
                        break;
                    }
                }
            }

            if message_index.is_none() {
                return Err("Message not found".to_string());
            }

            let message = target_message.unwrap();

            let is_message_owner = message.sender == executor_id;
            let is_moderator = self.moderators.contains(&executor_id).unwrap_or(false);
            let is_owner = self.owner == executor_id;

            if !is_message_owner && !is_moderator && !is_owner {
                return Err("You don't have permission to delete this message".to_string());
            }

            if let Some(index) = message_index {
                let mut deleted_message = message.clone();
                deleted_message.text.set("".to_string());
                deleted_message.deleted = Some(LwwRegister::new(true));

                let _ = channel_info.messages.update(index, deleted_message);
            }

            let _ = self.reactions.remove(&message_id);

            let _ = self.channels.insert(group.clone(), channel_info);

            if parent_id.is_some() {
                app::emit!(Event::MessageSentThread(MessageSentEvent {
                    message_id: message.id.get().clone(),
                    channel: group.name.get().clone(),
                }));
            } else {
                app::emit!(Event::MessageSent(MessageSentEvent {
                    message_id: message.id.get().clone(),
                    channel: group.name.get().clone(),
                }));
            }

            Ok("Message deleted successfully".to_string())
        }
    }

    // STEP1
    // Create DM chat - new Context with created old and new identity and invitee old identity
    // Each of them have new objects for DM chat
    // RC.11 update - invitation payload is now signed and sent to the user
    pub fn create_dm_chat(
        &mut self,
        context_id: String,
        creator: UserId,
        creator_new_identity: UserId,
        invitee: UserId,
        timestamp: u64,
        context_hash: String,
        invitation_payload: String,
    ) -> app::Result<String, String> {
        if *self.is_dm {
            return Err("Cannot create DMs in a DM chat".to_string());
        }

        let executor_id = self.get_executor_id();

        if creator != executor_id {
            return Err("You are not the inviter".to_string());
        }

        if !self.members.contains(&executor_id).unwrap_or(false) {
            return Err("You are not a member of the chat".to_string());
        }
        if !self.members.contains(&invitee).unwrap_or(false) {
            return Err("Invitee user is not a member of the chat".to_string());
        }

        if executor_id == invitee {
            return Err("Cannot create DM with yourself".to_string());
        }

        if self.dm_exists(&executor_id, &invitee) {
            return Err("DM already exists".to_string());
        }

        let own_username = self.member_usernames.get(&executor_id).unwrap().unwrap();
        let other_username = self.member_usernames.get(&invitee).unwrap().unwrap();

        let context_id_for_user = context_id.clone();
        // CREATOR
        let dm_chat_info = DMChatInfo {
            context_id: LwwRegister::new(context_id.clone()),
            channel_type: LwwRegister::new(ChannelType::Private),
            created_at: LwwRegister::new(timestamp),
            // user A - inviter
            created_by: executor_id,
            own_identity_old: creator.clone(),
            own_identity: Some(creator_new_identity.clone()),
            own_username: LwwRegister::new(own_username.get().clone()),
            // user B - invitee
            other_identity_old: invitee.clone(),
            other_identity_new: None,
            other_username: LwwRegister::new(other_username.get().clone()),
            did_join: LwwRegister::new(true),
            // Initialize with same hash for both users
            old_hash: LwwRegister::new(context_hash.clone()),
            new_hash: LwwRegister::new(context_hash.clone()),
            unread_messages: LwwRegister::new(0),
            // Add signed invitation payload - json string -> don't need to deserialize it
            invitation_payload: LwwRegister::new(invitation_payload.clone()),
        };

        self.add_dm_to_user(&executor_id, dm_chat_info);
        // INVITEE
        self.add_dm_to_user(
            &invitee,
            DMChatInfo {
                context_id: LwwRegister::new(context_id_for_user),
                channel_type: LwwRegister::new(ChannelType::Private),
                created_at: LwwRegister::new(timestamp),
                // user A - inviter
                created_by: executor_id,
                other_identity_old: creator.clone(),
                other_identity_new: Some(creator_new_identity.clone()),
                // user B - invitee
                own_identity_old: invitee.clone(),
                own_identity: None,
                own_username: LwwRegister::new(other_username.get().clone()),
                other_username: LwwRegister::new(own_username.get().clone()),
                invitation_payload: LwwRegister::new(invitation_payload),
                did_join: LwwRegister::new(false),
                // Initialize with same hash for both users
                old_hash: LwwRegister::new(context_hash.clone()),
                new_hash: LwwRegister::new(context_hash.clone()),
                unread_messages: LwwRegister::new(0),
            },
        );

        app::emit!(Event::DMCreated(context_id.clone()));

        Ok(context_id)
    }

    // STEP2
    // User updates his new identity and joins context as payload is now open invitation
    pub fn update_new_identity(
        &mut self,
        other_user: UserId,
        new_identity: UserId,
    ) -> app::Result<String, String> {
        if *self.is_dm {
            return Err("Cannot update new identity in a DM chat".to_string());
        }

        let executor_id = self.get_executor_id();

        if !self.members.contains(&executor_id).unwrap_or(false) {
            return Err("You are not a member of the chat".to_string());
        }

        if !self.dm_exists(&executor_id, &other_user) {
            return Err("DM does not exist".to_string());
        }

        if let Ok(Some(mut dms)) = self.dm_chats.get(&executor_id) {
            // He calls for himself - he is not the owner he has it like this
            let mut target_idx: Option<usize> = None;
            let mut idx = 0usize;
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    if dm.other_identity_old == other_user {
                        target_idx = Some(idx);
                        break;
                    }
                    idx += 1;
                }
            }
            if let Some(i) = target_idx {
                if let Ok(Some(dm)) = dms.get(i) {
                    let mut updated = dm.clone();
                    updated.own_identity = Some(new_identity.clone());
                    // We create new identtiy -> accept invitation -> if its okay then we save the new identity and new node joined the context
                    updated.did_join.set(true);
                    let _ = dms.update(i, updated);
                }
            }
            let _ = self.dm_chats.insert(executor_id.clone(), dms);
        }

        if let Ok(Some(mut dms)) = self.dm_chats.get(&other_user) {
            // He calls for the creator
            let mut target_idx: Option<usize> = None;
            let mut idx = 0usize;
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    if dm.other_identity_old == executor_id {
                        target_idx = Some(idx);
                        break;
                    }
                    idx += 1;
                }
            }
            if let Some(i) = target_idx {
                if let Ok(Some(dm)) = dms.get(i) {
                    let mut updated = dm.clone();
                    updated.other_identity_new = Some(new_identity.clone());
                    let _ = dms.update(i, updated);
                }
            }
            let _ = self.dm_chats.insert(other_user.clone(), dms);
        }

        app::emit!(Event::NewIdentityUpdated(other_user.clone().to_string()));

        Ok("Identity updated successfully".to_string())
    }

    pub fn get_dms(&self) -> app::Result<Vec<DMChatInfo>, String> {
        if *self.is_dm {
            return Err("Cannot get DMs in a DM chat".to_string());
        }
        let executor_id = self.get_executor_id();
        match self.dm_chats.get(&executor_id) {
            Ok(Some(dms)) => {
                let mut dm_list = Vec::new();
                if let Ok(iter) = dms.iter() {
                    for dm in iter {
                        dm_list.push(dm.clone());
                    }
                }
                Ok(dm_list)
            }
            Ok(None) => Ok(Vec::new()),
            Err(_) => Err("Failed to retrieve DMs".to_string()),
        }
    }

    /// Gets the own_identity for a DM context by context_id
    pub fn get_dm_identity_by_context(&self, context_id: String) -> app::Result<UserId, String> {
        if *self.is_dm {
            return Err("Cannot get DM identity in a DM chat".to_string());
        }

        let executor_id = self.get_executor_id();

        match self.dm_chats.get(&executor_id) {
            Ok(Some(dms)) => {
                if let Ok(iter) = dms.iter() {
                    for dm in iter {
                        if *dm.context_id == context_id {
                            // Return the own_identity if it exists, otherwise return own_identity_old
                            return Ok(dm
                                .own_identity
                                .clone()
                                .unwrap_or(dm.own_identity_old.clone()));
                        }
                    }
                }
                Err("DM context not found".to_string())
            }
            Ok(None) => Err("No DMs found".to_string()),
            Err(_) => Err("Failed to retrieve DM identity".to_string()),
        }
    }

    fn dm_exists(&self, user1: &UserId, user2: &UserId) -> bool {
        if let Ok(Some(dms)) = self.dm_chats.get(user1) {
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    if dm.other_identity_old == *user2 {
                        return true;
                    }
                }
            }
        }
        false
    }

    fn add_dm_to_user(&mut self, user: &UserId, dm_info: DMChatInfo) {
        let mut dms = match self.dm_chats.get(user) {
            Ok(Some(existing_dms)) => existing_dms,
            _ => Vector::new(),
        };
        let _ = dms.push(dm_info);
        let _ = self.dm_chats.insert(user.clone(), dms);
    }

    fn remove_dm_from_user(&mut self, user: &UserId, other_user: &UserId) {
        if let Ok(Some(dms)) = self.dm_chats.get(user) {
            let mut new_vec = Vector::new();
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    if dm.other_identity_old != *other_user {
                        let _ = new_vec.push(dm.clone());
                    }
                }
            }
            let _ = self.dm_chats.insert(user.clone(), new_vec);
        }
    }

    pub fn delete_dm(&mut self, other_user: UserId) -> app::Result<String, String> {
        if *self.is_dm {
            return Err("Cannot delete DMs in a DM chat".to_string());
        }
        let executor_id = self.get_executor_id();
        // Remove DM records for both participants
        self.remove_dm_from_user(&executor_id, &other_user);
        self.remove_dm_from_user(&other_user, &executor_id);

        // Remove DM channel and related per-channel data
        let dm_channel = Channel {
            name: LwwRegister::new(other_user.to_string()),
        };

        // Remove unread/mentions for all members of this channel first
        if let Ok(Some(members)) = self.channel_members.get(&dm_channel) {
            if let Ok(iter) = members.iter() {
                for member_id in iter {
                    // Remove unread entry for this channel
                    if let Ok(Some(mut user_unread)) = self.user_channel_unread.get(&member_id) {
                        let _ = user_unread.remove(&dm_channel);
                        let _ = self
                            .user_channel_unread
                            .insert(member_id.clone(), user_unread);
                    }

                    // Remove mentions entry for this channel
                    if let Ok(Some(mut user_mentions)) = self.user_channel_mentions.get(&member_id)
                    {
                        let _ = user_mentions.remove(&dm_channel);
                        let _ = self
                            .user_channel_mentions
                            .insert(member_id.clone(), user_mentions);
                    }
                }
            }
            // Remove member set for this channel
            let _ = self.channel_members.remove(&dm_channel);
        }

        // Finally remove the channel itself
        let _ = self.channels.remove(&dm_channel);

        // Emit DMDeleted with executor_id
        app::emit!(Event::DMDeleted(executor_id.clone().to_string()));

        Ok("DM deleted successfully".to_string())
    }

    /// Updates hash tracking for DM participants when a message is sent
    pub fn update_dm_hashes(&mut self, sender_id: UserId, other_user_id: UserId, new_hash: &str) {
        // Update sender's DM hash
        if let Ok(Some(mut dms)) = self.dm_chats.get(&sender_id) {
            let mut target_idx: Option<usize> = None;
            let mut idx = 0usize;
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    if dm.other_identity_old == other_user_id
                        || dm.other_identity_new.as_ref() == Some(&other_user_id)
                    {
                        target_idx = Some(idx);
                        break;
                    }
                    idx += 1;
                }
            }
            if let Some(i) = target_idx {
                if let Ok(Some(dm)) = dms.get(i) {
                    let mut updated = dm.clone();
                    updated.old_hash.set(new_hash.to_string());
                    updated.new_hash.set(new_hash.to_string());
                    let _ = dms.update(i, updated);
                }
            }
            let _ = self.dm_chats.insert(sender_id.clone(), dms);
        }

        // Update other user's DM hash (set old_hash to their current new_hash, new_hash to the new hash)
        // Also increment unread message count for the recipient
        if let Ok(Some(mut dms)) = self.dm_chats.get(&other_user_id) {
            let mut target_idx: Option<usize> = None;
            let mut idx = 0usize;
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    if dm.other_identity_old == sender_id
                        || dm.other_identity_new.as_ref() == Some(&sender_id)
                    {
                        target_idx = Some(idx);
                        break;
                    }
                    idx += 1;
                }
            }
            if let Some(i) = target_idx {
                if let Ok(Some(dm)) = dms.get(i) {
                    let mut updated = dm.clone();
                    updated.old_hash.set(updated.new_hash.get().clone());
                    updated.new_hash.set(new_hash.to_string());
                    updated.unread_messages.set(*updated.unread_messages + 1);
                    let _ = dms.update(i, updated);
                }
            }
            let _ = self.dm_chats.insert(other_user_id.clone(), dms);
        }
    }

    /// Checks if a DM has new messages for a user
    pub fn dm_has_new_messages(&self, user_id: UserId, other_user_id: UserId) -> bool {
        if let Ok(Some(dms)) = self.dm_chats.get(&user_id) {
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    if dm.other_identity_old == other_user_id
                        || dm.other_identity_new.as_ref() == Some(&other_user_id)
                    {
                        return dm.old_hash.get() != dm.new_hash.get();
                    }
                }
            }
        }
        false
    }

    /// Gets DM info with new message status
    pub fn get_dm_with_status(
        &self,
        other_user_id: UserId,
    ) -> app::Result<(DMChatInfo, bool), String> {
        if *self.is_dm {
            return Err("Cannot get DM info in a DM chat".to_string());
        }

        let executor_id = self.get_executor_id();

        if let Ok(Some(dms)) = self.dm_chats.get(&executor_id) {
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    if dm.other_identity_old == other_user_id
                        || dm.other_identity_new.as_ref() == Some(&other_user_id)
                    {
                        let has_new_messages = dm.old_hash.get() != dm.new_hash.get();
                        return Ok((dm.clone(), has_new_messages));
                    }
                }
            }
        }

        Err("DM not found".to_string())
    }

    /// Marks DM messages as read for a user (resets hash tracking)
    pub fn mark_dm_as_read(&mut self, other_user_id: UserId) -> app::Result<String, String> {
        if *self.is_dm {
            return Err("Cannot mark DM as read in a DM chat".to_string());
        }

        let executor_id = self.get_executor_id();

        if let Ok(Some(mut dms)) = self.dm_chats.get(&executor_id) {
            let mut target_idx: Option<usize> = None;
            let mut idx = 0usize;
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    if dm.other_identity_old == other_user_id
                        || dm.other_identity_new.as_ref() == Some(&other_user_id)
                    {
                        target_idx = Some(idx);
                        break;
                    }
                    idx += 1;
                }
            }
            if let Some(i) = target_idx {
                if let Ok(Some(dm)) = dms.get(i) {
                    let mut updated = dm.clone();
                    // Reset hash tracking - mark as read
                    updated.old_hash.set(updated.new_hash.get().clone());
                    // Reset unread message count
                    updated.unread_messages.set(0);
                    let _ = dms.update(i, updated);
                }
            }
            let _ = self.dm_chats.insert(executor_id.clone(), dms);
        }

        Ok("DM marked as read".to_string())
    }

    /// Gets the unread message count for a specific DM
    pub fn get_dm_unread_count(&self, other_user_id: UserId) -> app::Result<u32, String> {
        if *self.is_dm {
            return Err("Cannot get DM unread count in a DM chat".to_string());
        }

        let executor_id = self.get_executor_id();

        if let Ok(Some(dms)) = self.dm_chats.get(&executor_id) {
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    if dm.other_identity_old == other_user_id
                        || dm.other_identity_new.as_ref() == Some(&other_user_id)
                    {
                        return Ok(*dm.unread_messages);
                    }
                }
            }
        }

        Err("DM not found".to_string())
    }

    /// Gets the total unread message count across all DMs for a user
    pub fn get_total_dm_unread_count(&self) -> app::Result<u32, String> {
        if *self.is_dm {
            return Err("Cannot get total DM unread count in a DM chat".to_string());
        }

        let executor_id = self.get_executor_id();

        if let Ok(Some(dms)) = self.dm_chats.get(&executor_id) {
            let mut total_unread: u32 = 0;
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    total_unread += *dm.unread_messages;
                }
            }
            return Ok(total_unread);
        }

        Ok(0)
    }

    /// Marks all DM messages as read for a user (resets all unread counts)
    pub fn mark_all_dms_as_read(&mut self) -> app::Result<String, String> {
        if *self.is_dm {
            return Err("Cannot mark all DMs as read in a DM chat".to_string());
        }

        let executor_id = self.get_executor_id();

        if let Ok(Some(mut dms)) = self.dm_chats.get(&executor_id) {
            let mut idx = 0usize;
            let mut to_update: Vec<(usize, DMChatInfo)> = Vec::new();
            if let Ok(iter) = dms.iter() {
                for dm in iter {
                    let mut updated = dm.clone();
                    updated.old_hash.set(updated.new_hash.get().clone());
                    updated.unread_messages.set(0);
                    to_update.push((idx, updated));
                    idx += 1;
                }
            }
            for (i, updated) in to_update {
                let _ = dms.update(i, updated);
            }
            let _ = self.dm_chats.insert(executor_id.clone(), dms);
        }

        Ok("All DMs marked as read".to_string())
    }
}
