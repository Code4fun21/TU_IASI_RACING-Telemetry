// src/components/MQTT/Components/LapSelect.jsx
import PropTypes from "prop-types";

export default function LapSelect({ options, value, onSelect }) {
  return (
    <select
      className="border rounded px-2 py-1"
      value={value}
      onChange={e => onSelect(options.find(o => o.value == e.target.value))}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

LapSelect.propTypes = {
  options: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.number.isRequired,
    })
  ).isRequired,
  value: PropTypes.number,
  onSelect: PropTypes.func.isRequired,
};
