import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Conversation, TextConversation } from '@elevenlabs/client';
import MentorPanel from './MentorPanel';
vi.mock('@elevenlabs/client', () => ({ Conversation: { startSession: vi.fn() }, TextConversation: { startSession: vi.fn() } }));
vi.mock('./ui/button', () => ({ Button: ({ children, size, asChild, ...props }: any) => <button {...props}>{children}</button> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('mentor test session integration', () => {
  it('retains SDK microphone control for ordinary voice sessions', async () => {
    const setMicMuted = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      signed_url: 'wss://example.test', mentor_context_mode: 'app_resolved', mentor_session_id: 'voice_test'
    }))));
    vi.mocked(Conversation.startSession).mockImplementation(async (input: any) => {
      expect(input.textOnly).not.toBe(true);
      input.onConnect();
      return { setMicMuted, endSession: vi.fn() } as any;
    });
    render(<MentorPanel signedData="test-data" signedSig="test-signature" lessonId="853" userId="32" subscriptionId="78" courseId="10" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start lesson' }));
    await waitFor(() => expect(setMicMuted).toHaveBeenCalledWith(true));
  });
  it('uses text-only ElevenLabs with lesson context and exposes actual SDK replies', async () => {
    const sendUserMessage = vi.fn();
    const setMicMuted = vi.fn(() => { throw new Error('No audio track in text mode'); });
    let options: any;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      signed_url: 'wss://example.test', session_mode: 'course_test', delivery: 'disabled',
      mentor_context_mode: 'app_resolved', mentor_session_id: 'course_test_123'
    }))));
    vi.mocked(TextConversation.startSession).mockImplementation(async (input: any) => {
      options = input; input.onConnect(); return { sendUserMessage, setMicMuted, endSession: vi.fn() } as any;
    });
    render(<MentorPanel courseTestMode signedData="test-data" signedSig="test-signature" coursename="Pathlib" lessonname="Build paths" lessonId="853" userId="32" subscriptionId="78" courseId="10" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start lesson' }));
    await waitFor(() => expect(TextConversation.startSession).toHaveBeenCalled());
    expect(options).not.toHaveProperty('textOnly');
    expect(options).not.toHaveProperty('overrides');
    expect(options.dynamicVariables.mentor_session_id).toBe('course_test_123');
    await act(async () => options.onMessage({ source: 'agent', message: 'Why use Path objects?' }));
    expect(screen.getByRole('log', { name: 'Mentor test transcript' }).textContent).toContain('Why use Path objects?');
    expect(setMicMuted).not.toHaveBeenCalled();
    expect(screen.queryByText('Could not update the microphone state.')).toBeNull();
    fireEvent.change(screen.getByLabelText('Message to mentor'), { target: { value: 'To compose paths portably.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(sendUserMessage).toHaveBeenCalledWith('To compose paths portably.'));
  });
  it('refuses to start a test conversation against a service without isolation support', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ signed_url: 'wss://example.test' }))));
    render(<MentorPanel courseTestMode signedData="test-data" signedSig="test-signature" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start lesson' }));
    await screen.findByText('This mentor service does not support isolated course testing yet.');
    expect(Conversation.startSession).not.toHaveBeenCalled();
  });
});
