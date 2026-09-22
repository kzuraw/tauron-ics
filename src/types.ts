export interface AddressConfig {
  city: string;
  street: string;
  houseNumber: string;
  messagePrefix: string;
}

export interface AddressResolution {
  cityGaid: number;
  cityName: string;
  streetGaid: number;
  streetName: string;
}

export interface CachedAddressResolution extends AddressResolution {
  addressHash: string;
}

export interface TauronCity {
  GAID: number;
  Name: string;
}

export interface TauronStreet {
  FullName: string;
  GAID: number;
  Name: string;
  ShortName: string;
}

export interface TauronOutageItem {
  EndDate: string | null;
  IsActive: boolean;
  Message: string | null;
  Modified: string | null;
  OutageId: string | null;
  StartDate: string | null;
  TypeId: number | null;
}

export interface TauronOutageResponse {
  OutageItems: TauronOutageItem[] | null;
}

export interface Outage {
  end: Date;
  id: string;
  message: string;
  modified: Date | null;
  start: Date;
  typeId: number;
}

export interface OutageSchedule {
  outages: Outage[];
  rawOutageCount: number;
  resolution: AddressResolution;
}

export interface CalendarMetadata {
  etag: string;
  eventCount: number;
  lastModified: string;
  rawOutageCount: number;
  sourceHash: string;
}
