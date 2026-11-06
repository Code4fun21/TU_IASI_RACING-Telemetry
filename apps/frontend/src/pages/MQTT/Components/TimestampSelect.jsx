"use client";

import { useEffect, useState } from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
} from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { CheckIcon } from "@heroicons/react/20/solid";
import { api } from "../../../services/api";
import PropTypes from "prop-types";

export default function TimestampSelect({ sessionId, onSelect }) {
  const [selected, setSelected] = useState(null);
  const [timestamps, setTimestamps] = useState([]);

  useEffect(() => {
    if (!sessionId) return;
    
    api.getTimestamps("sessionId", sessionId)
      .then((data) => {
        setTimestamps(data || []);
      })
      .catch((err) => console.error("Error fetching timestamps:", err));
  }, [sessionId]);

  useEffect(() => {
    if (selected && onSelect) {
      onSelect(selected);
    }
  }, [selected, onSelect]);

  return (
    <Listbox value={selected} onChange={setSelected}>
      <div className="relative">
        <ListboxButton className="w-full cursor-default rounded-md bg-white py-1.5 pl-3 pr-10 text-left text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm border border-gray-300">
          <span className="block truncate">
            {selected
              ? new Date(selected.startTime).toLocaleString()
              : "Select timestamp"}
          </span>
          <ChevronUpDownIcon
            className="pointer-events-none absolute right-2 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
        </ListboxButton>
        
        <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm">
          {timestamps.length === 0 ? (
            <div className="py-2 pl-3 text-gray-500 italic">No timestamps found</div>
          ) : (
            timestamps.map((ts) => (
              <ListboxOption
                key={ts.id || ts.timestempId}
                value={ts}
                className={({ active, selected }) =>
                  `${
                    active ? "bg-indigo-600 text-white" : "text-gray-900"
                  } relative cursor-default select-none py-2 pl-3 pr-9`
                }
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`block truncate ${
                        selected ? "font-semibold" : "font-normal"
                      }`}
                    >
                      {new Date(ts.startTime).toLocaleString()}
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-white">
                        <CheckIcon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </ListboxOption>
            ))
          )}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}

TimestampSelect.propTypes = {
  sessionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSelect: PropTypes.func,
};