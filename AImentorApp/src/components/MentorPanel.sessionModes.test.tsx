import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Conversation, TextConversation } from '@elevenlabs/client';
import MentorPanel from './MentorPanel';

vi.mock('@elevenlabs/client', () => ({ Conversation: { startSession: vi.fn() }, TextConversation: { startSession: vi.fn() } }));
vi.mock('./ui/button', () => ({ Button: ({ children, size, asChild, ...props }: any) => <button {...props}>{children}</button> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.restoreAllMocks(); });

function setup(courseTestMode = false) {
  let callbacks: any;
  const session = { setMicMuted: vi.fn(), sendUserMessage: vi.fn(), endSession: vi.fn() };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ signed_url: 'wss://example.test', session_mode: 'course_test', delivery: 'disabled' }))));
  const startSession = async (options: any) => {
    callbacks = options;
    options.onConnect();
    return session as any;
  };
  vi.mocked(Conversation.startSession).mockImplementation(startSession);
  vi.mocked(TextConversation.startSession).mockImplementation(startSession);
  render(<MentorPanel courseTestMode={courseTestMode} signedData="test" signedSig="signature" />);
  return { session, options: () => callbacks };
}

describe('mentor session modes', () => {
  it('reports missing audio and clears the warning when actual audio arrives', async () => {
    const timers = vi.spyOn(window, 'setTimeout');
    const { options } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start lesson' }));
    await waitFor(() => expect(options()).toBeDefined());
    await waitFor(() => expect(timers.mock.calls.some(call => call[1] === 15000)).toBe(true));
    const audioTimeout = timers.mock.calls.find(call => call[1] === 15000)![0] as () => void;
    await act(async () => audioTimeout());
    expect(screen.getByText(/no audio has arrived/)).toBeTruthy();
    await act(async () => options().onAudio('audio-chunk'));
    expect(screen.queryByText(/no audio has arrived/)).toBeNull();
  });

  it('leaves connecting without audio and respects locked agent settings in voice mode', async () => {
    const { session, options } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start lesson' }));
    await waitFor(() => expect(session.setMicMuted).toHaveBeenCalled());
    expect(Conversation.startSession).toHaveBeenCalledTimes(1);
    expect(TextConversation.startSession).not.toHaveBeenCalled();
    expect(options()).not.toHaveProperty('textOnly');
    expect(options()).not.toHaveProperty('overrides');
    expect(screen.queryAllByText('Connecting...')).toHaveLength(0);
    expect(screen.queryByRole('combobox', { name: 'Session mode' })).toBeNull();
    expect(screen.queryByLabelText('Message to mentor')).toBeNull();
    expect(screen.getByText(/Connected\. Waiting for mentor audio/)).toBeTruthy();
    expect(screen.queryByText('Mentor is explaining...')).toBeNull();
    await act(async () => options().onModeChange({ mode: 'speaking' }));
    await act(async () => options().onMessage({ source: 'ai', message: 'Welcome to your lesson.' }));
    await act(async () => options().onModeChange({ mode: 'listening' }));
    expect(session.sendUserMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps chat exclusive to isolated internal course tests', async () => {
    const { session, options } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: 'Start lesson' }));
    await waitFor(() => expect(options()).toBeDefined());
    expect(TextConversation.startSession).toHaveBeenCalledTimes(1);
    expect(Conversation.startSession).not.toHaveBeenCalled();
    expect(options()).not.toHaveProperty('textOnly');
    expect(options()).not.toHaveProperty('overrides');
    await act(async () => options().onMessage({ source: 'ai', message: 'What does FIFO mean?' }));
    expect(screen.getByRole('log', { name: 'Mentor test transcript' }).textContent).toContain('What does FIFO mean?');
    expect(screen.queryAllByText('Connecting...')).toHaveLength(0);
    expect(screen.getByText(/no lesson or recap delivery/)).toBeTruthy();
    expect(session.setMicMuted).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Message to mentor'), { target: { value: 'First in, first out.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(session.sendUserMessage).toHaveBeenCalledWith('First in, first out.'));
    await act(async () => options().onMessage({ source: 'ai', message: 'Correct. Can you give an example?' }));
    expect(screen.getByRole('log').textContent).toContain('Correct. Can you give an example?');
    expect(screen.queryByText('Agent is thinking...')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'End test session' }));
    await waitFor(() => expect(session.endSession).toHaveBeenCalled());
    expect((screen.getByLabelText('Message to mentor') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole('combobox', { name: 'Session mode' })).toBeNull();
  });

  it('does not overwrite a fast chat reply with a thinking state', async () => {
    const { session, options } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: 'Start lesson' }));
    await waitFor(() => expect(options()).toBeDefined());
    session.sendUserMessage.mockImplementation(() => options().onMessage({ source: 'ai', message: 'Correct!' }));
    fireEvent.change(screen.getByLabelText('Message to mentor'), { target: { value: 'FIFO' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('Correct!'));
    expect(screen.queryByText('Agent is thinking...')).toBeNull();
    expect(screen.getByRole('log').textContent).toMatch(/Tester: FIFO.*Mentor: Correct!/);
  });

  it('recovers from a failed chat send so the learner can retry', async () => {
    const { session, options } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: 'Start lesson' }));
    await waitFor(() => expect(options()).toBeDefined());
    session.sendUserMessage.mockRejectedValue(new Error('Connection lost'));
    fireEvent.change(screen.getByLabelText('Message to mentor'), { target: { value: 'FIFO' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByText('Connection lost');
    expect(screen.queryByText('Agent is thinking...')).toBeNull();
    expect(screen.getByRole('log').textContent).not.toContain('FIFO');
    expect((screen.getByLabelText('Message to mentor') as HTMLTextAreaElement).value).toBe('FIFO');
  });
});
