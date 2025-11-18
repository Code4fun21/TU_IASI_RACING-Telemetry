import csv

input_file = "D:\\mine\\facultate\\tuiasiRacing\\app\\TUIasiRacing-Backend\\data_files\\log_with_no_wifi_933.csv"
output_file = "filtered_coolant.csv"

with open(input_file, "r", newline="") as infile, open(output_file, "w", newline="") as outfile:
    reader = csv.reader(infile)
    writer = csv.writer(outfile)

    for row in reader:
        # print(row[1]=="118")
        if len(row) < 2:  # skip malformed lines
            continue
        try:
            if row[1]=="118" or row[1]=="119":
                writer.writerow(row)
        except ValueError:
            # Skip header or non-integer IDs
            continue

print(f"Filtered lines with id=117 saved to {output_file}")