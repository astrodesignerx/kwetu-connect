"use client";

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { signalApi, type ThreadState } from '@/lib/signal-api';

export function useThreadState(threadId: string, replyState: ThreadState['replyState']) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () => signalApi.setThreadState(threadId, replyState === 'Done' ? 'ToReply' : 'Done'),
    onSuccess: () => {
      for (const key of ['thread', 'threads', 'mail-brief', 'overview', 'thread-counts']) void cache.invalidateQueries({ queryKey: [key] });
    },
  });
}
