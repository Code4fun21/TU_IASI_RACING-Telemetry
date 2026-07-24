import PropTypes from "prop-types";

// The ordered list of possible gears. 
// The order is critical here: this is what makes the directional sliding work.
const GEARS = ["R", "N", "1", "2", "3", "4", "5", "6"];

const GearDisplay = ({ data, width = 150, height = 150 }) => {
  // Convert incoming data to a string (e.g., number 1 becomes "1")
  const currentGear = String(data).toUpperCase();
  
  // Find where this gear lives in our array
  let index = GEARS.indexOf(currentGear);
  if (index === -1) index = 1; // Default to 'N' if invalid data is passed

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#fff",
        border: "2px solid #999",
        borderRadius: "8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        boxSizing: "border-box",
        paddingTop: "15px",
        fontFamily: "sans-serif",
      }}
    >
      {/* Static Label */}
      <div style={{ color: "#999", fontSize: "14px", fontWeight: "bold" }}>
        GEAR
      </div>

      {/* Animated Number Window (The "Slot Machine" window) */}
      <div
        style={{
          flex: 1,
          width: "100%",
          overflow: "hidden", // Hides the other numbers
          position: "relative",
        }}
      >
        {/* The sliding column of numbers */}
        <div
          style={{
            // Make the column tall enough to hold all gears
            height: `${GEARS.length * 100}%`,
            // This is where the magic happens: a snappy mechanical bounce transition
            transition: "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            // Shift the column up or down based on the active gear's index
            transform: `translateY(-${index * (100 / GEARS.length)}%)`,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {GEARS.map((gear) => (
            <div
              key={gear}
              style={{
                // Force each gear to exactly fill the height of the visible window
                height: `${100 / GEARS.length}%`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: height * 0.45, // Scales nicely with the component height
                fontWeight: "bolder",
                color: "#777", // Matches your RPM gauge text color
              }}
            >
              {gear}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

GearDisplay.propTypes = {
  data: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  width: PropTypes.number,
  height: PropTypes.number,
};

export default GearDisplay;