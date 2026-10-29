"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { parsePlaceAddressComponents } from "@/lib/integrations/google-places";
import { loadGoogleMaps } from "@/lib/maps/load-google-maps";

/** Dubai Design District — sensible default pin for UAE pop-ups. */
const DEFAULT_CENTER = { lat: 25.1885, lng: 55.2804 };

/**
 * @typedef {{
 *   country: string,
 *   city: string,
 *   town: string,
 *   venue: string,
 *   formatted_address: string,
 *   place_id: string,
 *   lat: number | null,
 *   lng: number | null,
 * }} PlacesLocationValue
 */

/**
 * Google Places Autocomplete + draggable map pin for popup markets.
 * Requires a Connected Google Places key from Integrations / Vercel.
 *
 * @param {{
 *   apiKey: string,
 *   connected: boolean,
 *   value: PlacesLocationValue,
 *   onChange: (next: PlacesLocationValue) => void,
 *   disabled?: boolean,
 * }} props
 */
export function PlacesLocationPicker({
  apiKey,
  connected,
  value,
  onChange,
  disabled = false,
}) {
  const searchId = useId();
  const mapRef = useRef(null);
  const inputRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const autocompleteRef = useRef(null);
  const geocoderRef = useRef(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const [mapsError, setMapsError] = useState("");
  const [mapsReady, setMapsReady] = useState(false);

  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!connected || !apiKey || disabled) {
      setMapsReady(false);
      return undefined;
    }
    let cancelled = false;

    function reverseFill(lat, lng) {
      const current = valueRef.current;
      const emit = onChangeRef.current;
      const geocoder = geocoderRef.current;
      if (!geocoder) {
        emit({ ...current, lat, lng });
        return;
      }
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        const latest = valueRef.current;
        if (status !== "OK" || !results?.[0]) {
          emit({ ...latest, lat, lng });
          return;
        }
        const place = results[0];
        const parsed = parsePlaceAddressComponents(place.address_components);
        emit({
          country: parsed.country || latest.country || "",
          city: parsed.city || latest.city || "",
          town: parsed.town || latest.town || "",
          venue: latest.venue || place.formatted_address || "",
          formatted_address:
            place.formatted_address || latest.formatted_address || "",
          place_id: place.place_id || latest.place_id || "",
          lat,
          lng,
        });
      });
    }

    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled || !mapRef.current || !inputRef.current) return;

        const current = valueRef.current;
        const startLat =
          typeof current.lat === "number" && Number.isFinite(current.lat)
            ? current.lat
            : DEFAULT_CENTER.lat;
        const startLng =
          typeof current.lng === "number" && Number.isFinite(current.lng)
            ? current.lng
            : DEFAULT_CENTER.lng;

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: startLat, lng: startLng },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        mapInstance.current = map;
        geocoderRef.current = new google.maps.Geocoder();

        const marker = new google.maps.Marker({
          map,
          position: { lat: startLat, lng: startLng },
          draggable: true,
          title: "Market pin",
        });
        markerRef.current = marker;

        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (!pos) return;
          reverseFill(pos.lat(), pos.lng());
        });

        map.addListener("click", (event) => {
          if (!event.latLng) return;
          marker.setPosition(event.latLng);
          reverseFill(event.latLng.lat(), event.latLng.lng());
        });

        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          fields: [
            "address_components",
            "formatted_address",
            "geometry",
            "name",
            "place_id",
          ],
        });
        autocomplete.bindTo("bounds", map);
        autocompleteRef.current = autocomplete;

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (!place?.geometry?.location) {
            setMapsError("Choose a suggestion from Google Places.");
            return;
          }
          setMapsError("");
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          const parsed = parsePlaceAddressComponents(place.address_components);
          const latest = valueRef.current;
          if (place.geometry.viewport) {
            map.fitBounds(place.geometry.viewport);
          } else {
            map.setCenter({ lat, lng });
            map.setZoom(15);
          }
          marker.setPosition({ lat, lng });
          onChangeRef.current({
            country: parsed.country || latest.country || "",
            city: parsed.city || latest.city || "",
            town: parsed.town || "",
            venue: place.name || place.formatted_address || latest.venue || "",
            formatted_address: place.formatted_address || "",
            place_id: place.place_id || "",
            lat,
            lng,
          });
        });

        setMapsReady(true);
        setMapsError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setMapsReady(false);
          setMapsError(err.message || "Could not load Google Places.");
        }
      });

    return () => {
      cancelled = true;
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      if (markerRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(markerRef.current);
      }
      autocompleteRef.current = null;
      markerRef.current = null;
      mapInstance.current = null;
    };
  }, [apiKey, connected, disabled]);

  if (!connected) {
    return (
      <div className="rounded-md border border-line bg-stone/30 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-ink">Location (Google Places)</p>
          <Badge tone="warning">Waiting credentials</Badge>
        </div>
        <p className="mt-2 text-sm text-muted">
          Waiting credentials. Re-check Integrations when Google Places is Connected.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-ink">Location (Google Places)</p>
        <Badge tone="success">Connected</Badge>
      </div>

      <label className="block space-y-1.5" htmlFor={searchId}>
        <span className="block text-[13px] font-medium text-ink">
          Search country, city, or town
        </span>
        <input
          id={searchId}
          ref={inputRef}
          type="text"
          disabled={disabled}
          placeholder="Start typing — pick a Google Places suggestion"
          className="ops-field h-11 px-3 disabled:opacity-60"
          autoComplete="off"
        />
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        <Input
          label="Country"
          value={value.country}
          readOnly
          hint="From Places Autocomplete"
        />
        <Input
          label="City"
          value={value.city}
          readOnly
          hint="From Places Autocomplete"
        />
        <Input
          label="Town / area"
          value={value.town}
          readOnly
          hint="From Places Autocomplete"
        />
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-medium text-ink">Precise map pin</p>
        <div
          ref={mapRef}
          className="h-56 w-full overflow-hidden rounded-md border border-line bg-stone/40"
          aria-label="Drag the pin to set precise latitude and longitude"
        />
        <p className="mt-1.5 text-xs text-muted">
          Drag the pin or click the map to refine coordinates.
          {typeof value.lat === "number" && typeof value.lng === "number"
            ? ` Lat ${value.lat.toFixed(6)}, Lng ${value.lng.toFixed(6)}`
            : ""}
        </p>
      </div>

      {mapsError ? <p className="text-sm text-danger">{mapsError}</p> : null}
      {!mapsReady && !mapsError ? (
        <p className="text-sm text-muted">Loading Google Places…</p>
      ) : null}
    </div>
  );
}

/** Empty location value for forms. */
export function emptyPlacesLocation() {
  return {
    country: "",
    city: "",
    town: "",
    venue: "",
    formatted_address: "",
    place_id: "",
    lat: null,
    lng: null,
  };
}
