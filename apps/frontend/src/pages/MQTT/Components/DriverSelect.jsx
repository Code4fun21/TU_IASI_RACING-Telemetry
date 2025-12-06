// DriverSelect.jsx
"use client";

import { useEffect, useState } from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption
} from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/20/solid";
import { api } from "../../../services/api";

export default function DriverSelect({ value, onChange }) {
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    api.getDrivers()
      .then((res) => setDrivers(res))
      .catch(console.error);
  }, []);

  return (
    <Listbox value={value} onChange={onChange}>
      {/* 1. Button */}
      <ListboxButton className="w-full text-left bg-white border px-3 py-1 rounded flex items-center justify-between">
        <span className="block truncate">{value?.name || "Select a driver"}</span>
        <ChevronUpDownIcon className="w-5 h-5 text-gray-500" aria-hidden="true" />
      </ListboxButton>

      
      <ListboxOptions 
        anchor="bottom" 
        className="w-[var(--button-width)] bg-white border rounded shadow-lg max-h-60 overflow-auto z-[9999] mt-1 focus:outline-none"
      >
        {drivers.map((d) => (
          <ListboxOption
            key={d.id}
            value={d}
            className="group cursor-pointer select-none px-3 py-2 data-[focus]:bg-indigo-100 data-[selected]:bg-indigo-50"
          >
            <div className="flex justify-between items-center">
              <span className="block truncate font-normal group-data-[selected]:font-semibold">
                {d.name}
              </span>
              {value?.id === d.id && (
                <CheckIcon className="w-4 h-4 text-indigo-600" aria-hidden="true" />
              )}
            </div>
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}