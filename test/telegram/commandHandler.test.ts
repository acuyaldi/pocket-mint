import { describe, expect, it, vi } from 'vitest';
import { handleTelegramCommand, type CommandHandlerDeps } from '../../src/telegram/commandHandler';
import { parseTelegramCommand } from '../../src/telegram/commands';
import { ChannelError } from '../../src/channels/errors';

function buildDeps(overrides: Partial<CommandHandlerDeps> = {}): CommandHandlerDeps {
  return {
    linkTokens: { createLinkToken: vi.fn(), consumeLinkToken: vi.fn() } as never,
    connections: {
      getActiveConnection: vi.fn().mockResolvedValue(null),
      getByUser: vi.fn(),
      revoke: vi.fn(),
      setCurrentConversation: vi.fn(),
    } as never,
    ...overrides,
  };
}

const cmd = (text: string) => parseTelegramCommand(text)!;

describe('handleTelegramCommand', () => {
  it('/start replies with a not-linked welcome message', async () => {
    const text = await handleTelegramCommand(buildDeps(), cmd('/start'), '1', 'chat-1');
    expect(text).toContain('/link');
  });

  it('/link success calls consumeLinkToken with the identity from the update, not from message text', async () => {
    const deps = buildDeps();
    (deps.linkTokens.consumeLinkToken as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'u1', connectionId: 'c1' });
    const text = await handleTelegramCommand(deps, cmd('/link secretcode123'), '999', '555');
    expect(deps.linkTokens.consumeLinkToken).toHaveBeenCalledWith('secretcode123', 'TELEGRAM', '999', '555');
    expect(text).toContain('Linked!');
  });

  it('/link failure relays the safe ChannelError message without leaking which check failed', async () => {
    const deps = buildDeps();
    (deps.linkTokens.consumeLinkToken as ReturnType<typeof vi.fn>).mockRejectedValue(ChannelError.linkInvalidOrExpired());
    const text = await handleTelegramCommand(deps, cmd('/link bad-token'), '1', 'chat-1');
    expect(text).toMatch(/invalid|expired|used/i);
  });

  it('/status reports linked-since when an active connection exists', async () => {
    const deps = buildDeps();
    (deps.connections.getActiveConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', userId: 'u1', conversationId: null, status: 'ACTIVE', linkedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const text = await handleTelegramCommand(deps, cmd('/status'), '1', 'chat-1');
    expect(text).toContain('Linked since');
  });

  it('/new clears the stored conversation for a linked connection', async () => {
    const deps = buildDeps();
    (deps.connections.getActiveConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', userId: 'u1', conversationId: 'conv-1', status: 'ACTIVE', linkedAt: new Date(),
    });
    await handleTelegramCommand(deps, cmd('/new'), '1', 'chat-1');
    expect(deps.connections.setCurrentConversation).toHaveBeenCalledWith('c1', null);
  });

  it('/unlink revokes the connection owned by the calling identity only', async () => {
    const deps = buildDeps();
    (deps.connections.getActiveConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', userId: 'u1', conversationId: null, status: 'ACTIVE', linkedAt: new Date(),
    });
    await handleTelegramCommand(deps, cmd('/unlink'), '1', 'chat-1');
    expect(deps.connections.revoke).toHaveBeenCalledWith('u1', 'TELEGRAM');
  });

  it('unrecognized command returns the help text', async () => {
    const text = await handleTelegramCommand(buildDeps(), cmd('/bogus'), '1', 'chat-1');
    expect(text).toMatch(/Unrecognized command/);
  });
});
