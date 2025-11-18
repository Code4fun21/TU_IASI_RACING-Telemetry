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
import { getDrivers } from "../../../api/drivers.routes"; // adjust path as needed

export default function DriverSelect({ value, onChange }) {
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    getDrivers()
      .then((res) => setDrivers(res.data))
      .catch(console.error);
  }, []);

  return (
    <Listbox value={value} onChange={onChange}>
      <div className="relative">
        <ListboxButton className="w-full text-left bg-white border px-3 py-1 rounded">
          {value?.name || "Select a driver"}
          <ChevronUpDownIcon className="w-5 h-5 inline float-right text-gray-500" />
        </ListboxButton>

        <ListboxOptions className="absolute mt-1 w-full bg-white border rounded shadow max-h-60 overflow-auto z-10">
          {drivers.map((d) => (
            <ListboxOption
              key={d.id}
              value={d}
              className="cursor-pointer px-3 py-1 hover:bg-indigo-100 flex justify-between"
            >
              {d.name}
              {value?.id === d.id && <CheckIcon className="w-4 h-4 text-indigo-600" />}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
