export interface room {
  roomid: string,
  isAvailable: boolean,
  hasWaiting: boolean,
  p1: {
    id: string | null,
    clientId?: string | null
  },
  p2: {
    id: string | null,
    clientId?: string | null
  },
  lastSeen?: number
}

export type GetTypesResult = 
| { type: 'p1', p2id: string | null }
| { type: 'p2', p1id: string | null }
| false;