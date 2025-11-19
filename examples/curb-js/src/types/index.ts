export type UserId = string;
export type Username = string;
export type ChannelId = string;

export type ChannelDefaultInit = {
  name: ChannelId;
};

export type InitParams = {
  ownerUsername: Username;
  defaultChannels?: ChannelDefaultInit[];
};

