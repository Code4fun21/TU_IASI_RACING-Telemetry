// MonopostSelect.jsx
"use client";

import { useEffect, useState } from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption
} from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/20/solid";
import { getMonoposts } from "../../../api/monoposts.routes"; // adjust path as needed

export default function MonopostSelect({ value, onChange }) {
  const [setups, setSetups] = useState([]);

  useEffect(() => {
    getMonoposts()
      .then((res) => setSetups(res.data))
      .catch(console.error);
  }, []);

  return (
    <Listbox value={value} onChange={onChange}>
      <div className="relative">
        <ListboxButton className="w-full text-left bg-white border px-3 py-1 rounded">
          {value?.name || "Select a setup"}
          <ChevronUpDownIcon className="w-5 h-5 inline float-right text-gray-500" />
        </ListboxButton>

        <ListboxOptions className="absolute mt-1 w-full bg-white border rounded shadow max-h-60 overflow-auto z-10">
          {setups.map((s) => (
            <ListboxOption
              key={s.id}
              value={s}
              className="cursor-pointer px-3 py-1 hover:bg-indigo-100 flex justify-between"
            >
              {s.name}
              {value?.id === s.id && <CheckIcon className="w-4 h-4 text-indigo-600" />}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
