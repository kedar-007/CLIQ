import { ChatLayout } from '@/components/chat/chat-layout';

interface Props {
  params: { channelId: string };
}

export default function ChannelPage({ params }: Props) {
  return <ChatLayout channelId={params.channelId} />;
}
